#!/usr/bin/env node

// Compile nearley grammar to ESM format

import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(currentDir, "..", "src");
const tempFile = join(srcDir, "ros1Grammar.tmp.js");

// Compile the grammar using nearleyc
console.log("Compiling nearley grammar...");
execSync(`npx nearleyc ${join(srcDir, "ros1.ne")} -o ${tempFile}`, {
  stdio: "inherit",
});

// Read the compiled output
const content = readFileSync(tempFile, "utf-8");

// Parse out the parts we need
const lines = content.split("\n");

// Find the grammar object - it starts with "var grammar = {"
let grammarStart = -1;
let grammarEnd = -1;
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("var grammar = {")) {
    grammarStart = i;
    braceCount = 1;
  } else if (grammarStart >= 0) {
    braceCount += (lines[i].match(/{/g) || []).length;
    braceCount -= (lines[i].match(/}/g) || []).length;
    if (braceCount === 0) {
      grammarEnd = i;
      break;
    }
  }
}

// Extract lexer setup (between moo.compile and var grammar)
let lexerSetup = "";
let inLexerSetup = false;
for (let i = 0; i < grammarStart; i++) {
  const line = lines[i];
  if (line.includes("const lexer = moo.compile(") || inLexerSetup) {
    inLexerSetup = true;
    lexerSetup += line + "\n";
    if (line.includes("});") && !line.includes("moo.compile")) {
      inLexerSetup = false;
    }
  }
}

// Extract helper functions (like extend)
let helpers = "";
for (let i = 0; i < grammarStart; i++) {
  const line = lines[i];
  if (line.startsWith("function ") && !line.includes("function ()")) {
    // Find the end of this function
    let funcEnd = i;
    let funcBraces = 0;
    for (let j = i; j < grammarStart; j++) {
      funcBraces += (lines[j].match(/{/g) || []).length;
      funcBraces -= (lines[j].match(/}/g) || []).length;
      if (funcBraces === 0) {
        funcEnd = j;
        break;
      }
    }
    helpers += lines.slice(i, funcEnd + 1).join("\n") + "\n\n";
  }
}

// Extract the grammar object
const grammarObj = lines.slice(grammarStart, grammarEnd + 1).join("\n");

// Build the ESM file
const esmContent = `// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
// Converted to ESM format

import moo from "moo";

${lexerSetup}
${helpers}
${grammarObj}

export default grammar;
`;

// Write the ESM version
writeFileSync(join(srcDir, "ros1Grammar.js"), esmContent);

// Clean up temp file
execSync(`rm ${tempFile}`);

console.log("Grammar compiled to ESM format: src/ros1Grammar.js");
