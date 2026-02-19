import { startEditor } from "@atmos/editor";
import { createEditorPhysics } from "@atmos/physics";

await startEditor({
  physics: await createEditorPhysics(),
});
