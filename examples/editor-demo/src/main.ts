import { startEditor, createEditorPhysics } from "@certe/atmos-editor";

await startEditor({
  physics: await createEditorPhysics(),
});
