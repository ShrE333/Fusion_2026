import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
export default defineConfig([...nextVitals, globalIgnores([".next/**", "node_modules/**", "GeoSathi_Street_AI_Mask2Former_SafePatch/**"])]);
