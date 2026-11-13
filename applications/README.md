# FullMeta applications

Each immediate application folder owns a `catalog.json` descriptor. The FullMeta launcher discovers descriptors under `applications/`; there is no central catalog to edit. Copying a complete application folder into this directory makes it available after refreshing the launcher.

```text
applications/
  fem/
    catalog.json
    fem.schema.json
    package.js                 # optional runtime package
    schema-documents.js        # optional runtime schema loader
    runtime-build.json         # optional native build plan
  weather-demo/
    catalog.json
    weather-demo.schema.json
```

The descriptor format is `fullmeta-application/1`:

```json
{
  "format": "fullmeta-application/1",
  "id": "weather-demo",
  "name": "Weather Demo",
  "description": "Example schema-only application.",
  "schema": "applications/weather-demo/weather-demo.schema.json"
}
```

The folder name must match `id`. IDs use lowercase letters, numbers, and hyphens. Descriptor paths are workspace-relative and must stay within `applications/<id>/`.

A schema-only application needs only its descriptor and schema. For an application-specific runtime, set `runtimePackage` to `true`; `schemaLoader` and `package` default to `applications/<id>/schema-documents.js` and `applications/<id>/package.js`. `runtimeBuild` optionally points to a native build plan and defaults to `applications/<id>/runtime-build.json` when `runtimePackage` is true.

The server scans only immediate, non-symlink application folders containing a valid root `catalog.json`. Folders without descriptors are ignored. Runtime build tools use the same folder and descriptor convention. Application-specific widgets remain under that application's `ui/widgets/` folder and are discovered by the frontend build.

The launcher's **New** action creates a schema-only application folder with a descriptor and starter schema. **Delete app** removes that folder. Projects remain independent under `projects/`.

The launcher offers **Create Project** for each application. It uses the
application package's project initializer when available, or initializes the
application schema's required fields, constants and defaults. Profiles are
optional. An incomplete schema reports the missing declaration in the creation
dialog. Project folders are created under `projects/`; an existing folder of
the same name is never overwritten.

## Bundled examples

An application may include project folders under `applications/<id>/examples/`.
Each example folder contains one root project JSON document for that application
and any files the project needs. The document's schema reference must resolve
when the folder is copied to `projects/<project-name>/`. FullMeta discovers
these folders and shows **Examples** on the application card. Choosing an
example creates and opens a separate project copy; an existing project folder
with the same name blocks the copy and the user can choose another name.

Each copy contains `fullmeta-example-origin.json`, identifying the application,
example and application version. If the descriptor has no `version`, the
version is a `sha256-tree-v1` fingerprint of the application files, excluding
examples, hidden entries, `target` and `node_modules`. File contents are hashed
in 4 MiB chunks; sorted relative paths and chunk-derived file hashes form the
tree fingerprint. The bundled example remains available for future copies.

