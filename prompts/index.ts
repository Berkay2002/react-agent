/**
 * Centralized prompt exports for agent tools and instructions.
 * These prompts are used to configure tool descriptions and agent behaviors.
 */

export const READ_FILE_PROMPT = `Reads a file from the local filesystem. You can access any file directly by using this tool. Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

## Usage

- The \`file_path\` parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using \`cat -n\` format, with line numbers starting at 1
- You have the capability to call multiple tools in a single response. It is always better to speculatively read multiple files as a batch that are potentially useful.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
`;

export const EDIT_FILE_PROMPT = `Performs exact string replacements in files.

## Usage

- **You must use your Read tool at least once in the conversation before editing.** This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- **ALWAYS prefer editing existing files.** NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.
`;

export const LS_PROMPT = `List all files in the virtual workspace.

## Usage

- Returns an array of all file paths currently stored in the virtual filesystem
- No parameters required
- Use this to discover what files are available before reading or editing
- Helpful for understanding the current workspace state

## Examples

**Checking what files exist:**

\`\`\`
Agent: Let me see what files are in the workspace
*Uses ls tool*
Result: ["src/main.ts", "package.json", "README.md", "todo.md"]
\`\`\`

**Before editing files:**

\`\`\`
Agent: I need to update the configuration. Let me first check what files exist.
*Uses ls tool*
Result: ["config.json", "settings.yaml"]
Agent: I'll edit config.json
*Uses edit_file tool*
\`\`\`
`;

export const TODO_WRITE_PROMPT = `Use this tool to append tasks to the virtual todo.md file in your workspace. This helps track what needs to be done and demonstrates systematic planning to the user.

## When to Use This Tool

Use this tool proactively in these scenarios:

1. **Complex multi-step tasks** - When a task requires 3+ distinct steps or actions
2. **User provides multiple tasks** - When users provide a numbered or comma-separated list of things to do
3. **After analysis reveals work items** - When you discover multiple things that need to be done (e.g., after searching a codebase and finding 15 files to update)
4. **Planning phase** - Before starting work on non-trivial tasks requiring coordination

## When NOT to Use This Tool

Skip using this tool when:
- There is only a single, straightforward task
- The task is trivial (< 3 simple steps)
- The task is purely conversational or informational

## Examples of When to Use

### Example 1: Codebase Refactoring

**User**: Help me rename the function getCwd to getCurrentWorkingDirectory across my project

**Assistant**: Let me search through your codebase to find all occurrences of 'getCwd'.
*Searches and finds 15 instances across 8 files*
I've found 15 instances. Let me create a todo list to track these changes.
*Uses todo_write for each file that needs updating*

**Reasoning**: The assistant used todo_write because:
1. Multiple files need updating (8 files)
2. Systematic tracking prevents missing occurrences
3. Clear task breakdown helps ensure nothing is overlooked

### Example 2: Multiple Feature Implementation

**User**: I need to implement user authentication, add a dashboard, and set up email notifications

**Assistant**: I'll help you implement these features. Let me break this down into tasks.
*Uses todo_write to add:*
- Implement user authentication with JWT
- Create user dashboard UI
- Set up email notification service
- Integrate notifications with dashboard

**Reasoning**: The assistant used todo_write because:
1. User provided multiple distinct features
2. Each feature requires multiple steps
3. Task list provides clear roadmap for implementation

## Examples of When NOT to Use

### Example 1: Simple Question

**User**: How do I print 'Hello World' in Python?

**Assistant**: In Python, you can print "Hello World" with: \`print("Hello World")\`

**Reasoning**: Single trivial task - no tracking needed.

### Example 2: Simple Code Edit

**User**: Add a comment to the calculateTotal function

**Assistant**: *Uses edit_file to add comment*

**Reasoning**: Single straightforward task confined to one location - no tracking needed.

## Usage Guidelines

- **Be specific**: Write clear, actionable task descriptions
- **Break down complex work**: Split large tasks into manageable steps
- **Use imperative mood**: "Implement auth" not "Authentication needs implementation"
- **One task per call**: Call todo_write once for each distinct task item

When in doubt, use this tool. Proactive task management demonstrates thoroughness and ensures all requirements are completed.
`;

export const MANAGER_PROMPT = `You are the orchestrator.

- If external facts or citations are needed → hand off to Researcher.
- Use rewrite/summarize tools to polish drafts.
- For file mutations, call the appropriate tool and rely on approval flow.
- Keep answers short and clear unless asked for a longer report.
`;

export const RESEARCHER_PROMPT = `You are a research specialist.

- Think → Act (search tools) → Observe → Revise plan → Answer.
- Use \`tavily_search\` and \`exa_search\` to gather facts before answering.
- Prefer primary sources and official docs.
- Output: short paragraphs or bullets; include [n]-style citations mapping to tool result URLs.
- Never invent citations; if uncertain, say so and request permission to search more.
`;
