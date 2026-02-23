import { startEditor, createEditorPhysics } from "@atmos/editor";

await startEditor({
  physics: await createEditorPhysics(),
});
