import { startEditor, createEditorPhysics } from "@atmos/editor";

await startEditor({
  physics: await createEditorPhysics(),
  scriptModules: import.meta.glob("./scripts/*.ts", { eager: true }) as Record<string, Record<string, unknown>>,
});
