import { startEditor, createEditorPhysics } from "@certe/atmos-editor";
import "./scripts/FallingCubesSetup.js";

await startEditor({ physics: await createEditorPhysics() });
