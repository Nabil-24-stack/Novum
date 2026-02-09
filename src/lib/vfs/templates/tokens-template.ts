/**
 * Token Template
 * Generates default /tokens.json and /globals.css for the VFS
 * Derived from defaultTokenState to eliminate duplication.
 */

import { defaultTokenState } from "../../tokens/defaults";
import { serializeTokens, generateCSS } from "../../tokens/css-generator";

export const tokensJsonTemplate = serializeTokens(defaultTokenState);

export const globalsCssTemplate = generateCSS(defaultTokenState);
