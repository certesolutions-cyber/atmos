import { startEditor, createEditorPhysics } from "@certe/atmos-editor";
import "./scripts/Floor.js";
import "./scripts/BallDropper.js";

await startEditor({ physics: await createEditorPhysics() });
