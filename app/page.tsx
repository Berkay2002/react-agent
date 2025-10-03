"use client";

import {
  AlertCircle,
  Bot,
  FileText,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
};

type AgentType = "manager" | "researcher";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>("manager");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) {
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          agent: selectedAgent,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-bold text-4xl tracking-tight">
            ReAct Agent Tester
          </h1>
          <p className="text-muted-foreground">
            Test your multi-agent system with Manager and Researcher agents
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle>Agent Chat</CardTitle>
                    <CardDescription>
                      Interact with your {selectedAgent} agent
                    </CardDescription>
                  </div>
                  <Button
                    disabled={messages.length === 0}
                    onClick={clearChat}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Clear
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[500px] rounded-md border p-4">
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <div className="flex h-[450px] items-center justify-center text-muted-foreground">
                        <div className="text-center">
                          <Bot className="mx-auto mb-4 size-12 opacity-50" />
                          <p>No messages yet. Start a conversation!</p>
                        </div>
                      </div>
                    ) : (
                      messages.map((message, index) => (
                        <div
                          className={`flex flex-col gap-2 ${
                            message.role === "user"
                              ? "items-end"
                              : "items-start"
                          }`}
                          key={`${message.role}-${index.toString()}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                message.role === "user"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {message.role}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {message.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {message.content}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    {isLoading && (
                      <div className="flex items-start gap-2">
                        <Badge variant="secondary">assistant</Badge>
                        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                          <Loader2 className="size-4 animate-spin" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Textarea
                    className="min-h-[100px]"
                    disabled={isLoading}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit().catch(() => {
                          // Ignore errors
                        });
                      }
                    }}
                    placeholder="Type your message here..."
                    value={input}
                  />
                  <div className="flex justify-between">
                    <p className="text-muted-foreground text-xs">
                      Press Enter to send, Shift+Enter for new line
                    </p>
                    <Button
                      disabled={isLoading || !input.trim()}
                      onClick={() => {
                        handleSubmit().catch(() => {
                          // Ignore errors
                        });
                      }}
                    >
                      {isLoading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 size-4" />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Agent Selection</CardTitle>
                <CardDescription>
                  Choose which agent to interact with
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  onValueChange={(value) =>
                    setSelectedAgent(value as AgentType)
                  }
                  value={selectedAgent}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <Bot className="size-4" />
                        Manager Agent
                      </div>
                    </SelectItem>
                    <SelectItem value="researcher">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4" />
                        Researcher Agent
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agent Info</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="manager" value={selectedAgent}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="manager">Manager</TabsTrigger>
                    <TabsTrigger value="researcher">Researcher</TabsTrigger>
                  </TabsList>
                  <TabsContent className="space-y-2" value="manager">
                    <p className="text-muted-foreground text-sm">
                      Orchestrates tasks and delegates to specialists
                    </p>
                    <Separator />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">Tools:</p>
                      <ul className="space-y-1 text-muted-foreground text-xs">
                        <li>• write_file</li>
                        <li>• edit_file</li>
                        <li>• todo_write</li>
                        <li>• rewrite</li>
                        <li>• summarize</li>
                      </ul>
                    </div>
                  </TabsContent>
                  <TabsContent className="space-y-2" value="researcher">
                    <p className="text-muted-foreground text-sm">
                      Performs web searches and gathers information
                    </p>
                    <Separator />
                    <div className="space-y-1">
                      <p className="font-medium text-sm">Tools:</p>
                      <ul className="space-y-1 text-muted-foreground text-xs">
                        <li>• tavily (search)</li>
                        <li>• exa (search)</li>
                        <li>• read_file</li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Messages</span>
                  <span className="font-medium">{messages.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Agent</span>
                  <Badge variant="outline">{selectedAgent}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="text-center text-muted-foreground text-sm">
          <p>© 2025 ReAct Agent System</p>
        </footer>
      </div>
    </div>
  );
}
