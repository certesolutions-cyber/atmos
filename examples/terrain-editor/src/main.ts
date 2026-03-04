import { registerTerrainBuiltins } from "@certe/atmos-terrain";
import { startEditor } from "@certe/atmos-editor";
import "./scripts/world.js";
import "./scripts/FPSWalker.js";

registerTerrainBuiltins();

await startEditor({});
