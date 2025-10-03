List all files in the virtual workspace.

## Usage

- Returns an array of all file paths currently stored in the virtual filesystem
- No parameters required
- Use this to discover what files are available before reading or editing
- Helpful for understanding the current workspace state

## Examples

**Checking what files exist:**

```
Agent: Let me see what files are in the workspace
*Uses ls tool*
Result: ["src/main.ts", "package.json", "README.md", "todo.md"]
```

**Before editing files:**

```
Agent: I need to update the configuration. Let me first check what files exist.
*Uses ls tool*
Result: ["config.json", "settings.yaml"]
Agent: I'll edit config.json
*Uses edit_file tool*
```
