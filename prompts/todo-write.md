Use this tool to append tasks to the virtual todo.md file in your workspace. This helps track what needs to be done and demonstrates systematic planning to the user.

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

**Assistant**: In Python, you can print "Hello World" with: `print("Hello World")`

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
