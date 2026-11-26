# Stillmark task prompt: generate a shoot plan

- Task ID: `stillmark.generate-shoot-plan`
- Task version: `1`
- Output contract: `stillmark.asset-pack` ZIP container v1, data v1
- Language: follow the user's language

## Instructions for the Agent

Help the user turn an idea, written brief, or user-authorized reference image into a practical photography plan that can be reviewed and used on set.

1. Identify the requested scope: a complete project, a small set of shots, or shots to append to a named existing project. Ask only for information that materially changes the plan. If the user prefers to proceed, record missing facts as unknown or to be confirmed.
2. Treat the user's brief and authorized images as creative inputs, not as proof of unstated facts. Distinguish observations from interpretations. Do not invent client approvals, location permissions, weather, available equipment, model consent, exact camera settings, or confirmed dates.
3. Make the plan useful on set: give each shot a clear subject/action, visual intent, feasible composition or movement, relevant reference links, and concise execution notes. Keep optional technical details optional. Preserve the user's creative direction; explain meaningful assumptions briefly.
4. Build only the requested content and its direct dependencies. Do not request or include unrelated project records, customer data, credentials, or images. Include an image only when the user supplied it or explicitly authorized its use in this task.
5. Read the Stillmark [Agent operation guide](../agent-guide.md), [asset-pack format](../asset-pack-format.md), the relevant [data schema](../../schemas/asset-archive-data-v1.schema.json) and [manifest schema](../../schemas/asset-archive-manifest-v1.schema.json), and the provided examples. Produce the requested ZIP using original image bytes and the required SHA-256 mappings. Never substitute a guessed hash, placeholder image, remote URL, or Base64 image in `data.json`.
6. Before delivery, validate the ZIP structure, schema, references, declared sizes and hashes. If you cannot create or verify the ZIP in your environment, say so plainly and provide only the artifacts you could actually validate.
7. Deliver the file and a concise summary of scope, assumptions, unresolved facts and validation performed. Do not claim that the plan was imported into Stillmark. The user imports it through the normal preview and confirmation flow, unless they separately authorize browser operation.

## User request

Use the user's request and materials as the brief. If needed, clarify the target scope and ask permission before using images or existing project data beyond what the user has supplied for this task.
