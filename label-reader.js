import {identify} from './rules.js';

const strengthPattern = /(?:\d+(?:\.\d+)?|\.\d+)\s*(?:mcg|µg|μg|mg|grams?|g|units?|iu|%)(?![a-z])(?:\s*\/\s*(?:\d+(?:\.\d+)?\s*)?(?:ml|l|hr|h|g|actuation|dose)\b)?/i;
const directionStart = /^(?:(?:sig|directions?|instructions?)\s*:\s*)?(?:take|give|use|apply|inject|instill|place|inhale|chew|dissolve|insert|swallow)\b/i;
const metadata = /\b(?:doctor|prescriber|patient|pharmacist|pharmacy|refills?|quantity|qty|ndc|discard|expires?|expiration|rx|store|warning|caution|manufacturer|birth|DOB)\b/i;
const continuation = /^(?:by|on|as|at|for|with|without|before|after|every|each|once|twice|three|four|daily|weekly|morning|evening|night|and|then|if|until|except|do not|one|two|half|\d|mouth|needed|day|hours?|times?|tablets?|capsules?)\b/i;
const variableDose = /\b(?:or|then|except|alternate|alternating|sliding|taper|increase|decrease|needed|prn|directed|if|and|up to|hold|follow)\b|\d\s*[-–]\s*\d/i;
const amountPattern = /^(?:take|give|use|apply|inject|instill|place|inhale|chew|dissolve|insert|swallow)\s+((?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+|one[- ]half|one[- ]quarter|one|two|three|four|half|½|¼)\s*(?:tablets?|tabs?|capsules?|caps?|milliliters?|ml|mcg|mg|grams?|units?|puffs?|drops?|patch(?:es)?))\b/i;
function fieldLine(line) {
  return line.replace(/^(?:(?:medication|drug|medicine)(?: name)?|name of drug)\s*:\s*/i,'');
}
function cleanLine(s) { return s.trim().replace(/\s+/g,' '); }
function normalized(s) { return cleanLine(s).toLowerCase(); }
function looksLikeName(s) {
  return s.length >= 3 && s.length <= 80 &&
    /^[a-z][a-z0-9]*(?:[ '-][a-z0-9]+){0,8}$/i.test(s) &&
    !/\d$/.test(s) && !metadata.test(s) && !directionStart.test(s) &&
    !/\b(?:strength|each|contains|maximum|per|tablet|tablets|bottle|ref|daily|generic for)\b/i.test(s);
}

// Preserve printed quantities. A product strength alone never supplies a dose.
export function readLabel(text, confidence = 100, weakLines = []) {
  const empty = {name:'', strength:'', dose:'', directions:''};
  if (!Number.isFinite(confidence) || confidence < 60) return {fields:empty, issue:'unclear'};
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const weak = new Set(weakLines.map(normalized));
  const candidates = [];
  let uncertainProduct = false;
  for (let i=0; i<lines.length; i++) {
    const line = fieldLine(lines[i]);
    if (metadata.test(line) || directionStart.test(line)) continue;
    const strength = line.match(strengthPattern);
    if (!strength) continue;
    let name = line.slice(0,strength.index).trim();
    let nameLine = lines[i];
    if (!name && i && identify(fieldLine(lines[i-1])).matched) {
      name = fieldLine(lines[i-1]);
      nameLine = lines[i-1];
    }
    if (!looksLikeName(name) && !identify(name).matched) { uncertainProduct = true; continue; }
    const tail = line.slice(strength.index+strength[0].length);
    if (/\d|^\s*[/+–-]/.test(tail)) { uncertainProduct = true; continue; }
    // Keep release modifiers with the printed product description even if they follow its strength.
    const formulation = /\b(?:extended[- ]release|delayed[- ]release|sustained[- ]release|controlled[- ]release|immediate[- ]release|enteric[- ]coated|XR|ER|SR|CR|DR|XL|EC|LA)\b/i.exec(tail);
    const printedStrength = formulation ? strength[0]+' '+formulation[0] : strength[0];
    candidates.push({name, strength:printedStrength, weak:weak.has(normalized(lines[i])) || weak.has(normalized(nameLine)), index:i});
  }
  const distinct = new Set(candidates.map(c=>normalized(c.name+' '+c.strength)));
  if (distinct.size > 1 || uncertainProduct && candidates.length) return {fields:empty,issue:'multiple'};
  const product = candidates[0];
  if (!product || product.weak) return {fields:empty, issue:'unclear'};

  const fields = {...empty,name:product.name,strength:product.strength};
  const start = lines.findIndex((line,i)=>i>product.index && directionStart.test(line));
  if(start < 0) return {fields,issue:'partial'};
  const sig = [lines[start].replace(/^(?:sig|directions?|instructions?)\s*:\s*/i,'')];
  let unsafe = weak.has(normalized(lines[start]));
  for(let i=start+1;i<lines.length;i++) {
    const line=lines[i];
    if(metadata.test(line)) break;
    if(directionStart.test(line) || continuation.test(line)){
      sig.push(line);
      unsafe ||= weak.has(normalized(line)) || directionStart.test(line);
    } else break;
  }
  const directions = sig.join(' ');
  if(unsafe || directions.length>500) return {fields,issue:'partial'};
  fields.directions = directions;
  // Only use a single, explicit administration amount from a simple direction.
  // Leave conditional or changing regimens for manual entry.
  const amount = directions.match(amountPattern);
  if(amount && !variableDose.test(directions) && !/\b(?:take|give|use)\b/i.test(directions.slice(amount[0].length))) fields.dose=amount[1];
  return {fields,issue:fields.dose?'':'partial'};
}
