import test from "node:test";
import assert from "node:assert/strict";
import tokenize from "glsl-tokenizer/string.js";
import parse from "glsl-parser/direct.js";
import * as shaders from "../src/shaders.js";
for (const name of [
  "terrainVertex",
  "terrainFragment",
  "skyVertex",
  "skyFragment",
  "particleVertex",
  "particleFragment",
])
  test(`${name} has valid GLSL syntax`, () => {
    assert.equal(
      parse(tokenize(shaders[name].replace(/^\s*#include.*$/gm, ""))).type,
      "stmtlist",
    );
  });
