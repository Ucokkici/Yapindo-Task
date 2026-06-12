import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const executeFallbackEngine = (prompt: string) => {
  console.log(
    "🔄 [FALLBACK LAYER ACTIVE]: Memproses perintah secara lokal dengan segmentasi cerdas...",
  );

  const responsePayload: { actions: any[] } = { actions: [] };

  const normalizedPrompt = prompt.toLowerCase();

  // --- Detect USER modification prompts first (FORBIDDEN) ---
  const userModifyKeywords = ["hapus", "delete", "ubah", "update", "ganti", "remove", "buang"];
  const userTargetKeywords = ["user", "admin", "pengguna", "akun"];
  const hasModifyIntent = userModifyKeywords.some((k) => normalizedPrompt.includes(k));
  const hasUserTarget = userTargetKeywords.some((k) => normalizedPrompt.includes(k));

  if (hasModifyIntent && hasUserTarget) {
    responsePayload.actions.push({
      type: "MODIFY_USER",
      data: { prompt },
    });
    return responsePayload;
  }

  // --- Detect QUERY-type prompts first (read-only) ---
  if (
    (normalizedPrompt.includes("prioritas") &&
      normalizedPrompt.includes("high")) ||
    (normalizedPrompt.includes("priority") &&
      normalizedPrompt.includes("high")) ||
    normalizedPrompt.includes("high priority") ||
    normalizedPrompt.includes("prioritas tinggi")
  ) {
    responsePayload.actions.push({
      type: "QUERY_HIGH_PRIORITY_PROJECTS",
      data: {},
    });
    return responsePayload;
  }

  if (
    normalizedPrompt.includes("mengerjakan project") ||
    normalizedPrompt.includes("mengerjakan proyek") ||
    normalizedPrompt.includes("working on") ||
    normalizedPrompt.includes("dikerjakan oleh") ||
    (normalizedPrompt.includes("user") &&
      normalizedPrompt.includes("project")) ||
    (normalizedPrompt.includes("user") && normalizedPrompt.includes("proyek"))
  ) {
    // Extract user name from prompt
    let userName = "";
    let userId: number | undefined;

    // Try to match: "User <Name> ..." or "user <Name> ..."
    const userNameMatch = prompt.match(
      /[Uu]ser\s+([A-Za-z\s]+?)(?:\s+saat|\s+sedang|\s+mengerjakan|\s+working|\s+lagi|\?|$)/,
    );
    if (userNameMatch && userNameMatch[1]) {
      userName = userNameMatch[1].trim();
    }

    // Try to match user ID: "user id 5", "user 5"
    const userIdMatch = normalizedPrompt.match(
      /user\s*(?:id)?\s*(\d+)/,
    );
    if (userIdMatch && userIdMatch[1]) {
      userId = Number(userIdMatch[1]);
      userName = "";
    }

    responsePayload.actions.push({
      type: "QUERY_USER_PROJECTS",
      data: {
        ...(userName ? { userName } : {}),
        ...(userId ? { userId } : {}),
      },
    });
    return responsePayload;
  }

  // --- Original command-type prompt processing ---
  const sentences = normalizedPrompt.split(
    /terus|sekalian|kemudian|lalu|dan|(?:\.\s+)/,
  );

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (
      trimmedSentence.includes("buat") ||
      trimmedSentence.includes("tambah") ||
      trimmedSentence.includes("create") ||
      trimmedSentence.includes("baru")
    ) {
      let projectId = 1;
      const projectMatch =
        trimmedSentence.match(/(?:project|proyek)\s*(?:id)?\s*(\d+)/) ||
        trimmedSentence.match(/id\s*(\d+)/);
      if (projectMatch && projectMatch[1]) projectId = Number(projectMatch[1]);

      let assigneeId = 1;
      const userMatch = trimmedSentence.match(
        /(?:user|assignee|untuk|ke)\s*(?:id)?\s*(\d+)/,
      );
      if (userMatch && userMatch[1]) {
        assigneeId = Number(userMatch[1]);
      } else {
        const allNumbers = trimmedSentence.match(/\d+/g);
        if (allNumbers && allNumbers.length >= 2) {
          const firstNum = Number(allNumbers[0]);
          if (firstNum === projectId && allNumbers[1]) {
            assigneeId = Number(allNumbers[1]);
          }
        }
      }

      let title = "Tugas Baru via AI";
      const quoteMatch = prompt.match(/"([^"]+)"/) || prompt.match(/'([^']+)'/);
      if (quoteMatch && quoteMatch[1]) {
        title = quoteMatch[1];
      } else {
        const cleanTitle = trimmedSentence
          .replace(/buat|tambah|task|baru|untuk|id|project|proyek/gi, "")
          .trim();
        if (cleanTitle)
          title = cleanTitle.split(" ke ")[0].split(" di ")[0].trim();
      }

      let priority = "MEDIUM";
      if (
        trimmedSentence.includes("high") ||
        trimmedSentence.includes("tinggi")
      )
        priority = "HIGH";
      if (trimmedSentence.includes("low") || trimmedSentence.includes("rendah"))
        priority = "LOW";

      responsePayload.actions.push({
        type: "CREATE_TASK",
        data: {
          title: title.substring(0, 50),
          projectId,
          assigneeId,
          priority,
          description: `Dibuat secara otomatis via AI Fallback Engine.`,
        },
      });
    } else if (
      trimmedSentence.includes("ubah") ||
      trimmedSentence.includes("update") ||
      trimmedSentence.includes("ganti") ||
      trimmedSentence.includes("status") ||
      trimmedSentence.includes("jadi")
    ) {
      let taskId = 1;
      const taskMatch =
        trimmedSentence.match(/(?:task)\s*(?:id)?\s*(\d+)/) ||
        trimmedSentence.match(/id\s*(\d+)/);
      if (taskMatch && taskMatch[1]) taskId = Number(taskMatch[1]);

      let status = "IN_PROGRESS";
      if (
        trimmedSentence.includes("done") ||
        trimmedSentence.includes("selesai") ||
        trimmedSentence.includes("sukses")
      )
        status = "DONE";
      if (trimmedSentence.includes("todo") || trimmedSentence.includes("belum"))
        status = "TODO";

      responsePayload.actions.push({
        type: "UPDATE_TASK",
        data: { taskId, status },
      });
    } else if (
      trimmedSentence.includes("hapus") ||
      trimmedSentence.includes("delete") ||
      trimmedSentence.includes("buang")
    ) {
      let taskId = 1;
      const taskMatch =
        trimmedSentence.match(/(?:task)\s*(?:id)?\s*(\d+)/) ||
        trimmedSentence.match(/id\s*(\d+)/);
      if (taskMatch && taskMatch[1]) taskId = Number(taskMatch[1]);

      responsePayload.actions.push({
        type: "DELETE_TASK",
        data: { taskId },
      });
    }
  }

  if (responsePayload.actions.length === 0) {
    responsePayload.actions.push({
      type: "CREATE_TASK",
      data: {
        title: "Custom Command",
        projectId: 1,
        assigneeId: 1,
        priority: "MEDIUM",
        description: prompt.substring(0, 100),
      },
    });
  }

  return responsePayload;
};

export const generateAIResponse = async (prompt: string) => {
  const systemPrompt = `You are an AI that converts natural language text into a JSON object with an "actions" array.

Supported action types:
1. CREATE_TASK — create a new task. Data: { title, projectId, assigneeId, priority, description, status }
2. UPDATE_TASK — update an existing task. Data: { taskId, status }
3. DELETE_TASK — delete an existing task. Data: { taskId }
4. QUERY_HIGH_PRIORITY_PROJECTS — query all projects that have tasks with HIGH priority. Data: {} (no parameters needed)
5. QUERY_USER_PROJECTS — query all projects a specific user is working on. Data: { userName?: string, userId?: number }

Rules:
- If the user asks about projects with high priority, use QUERY_HIGH_PRIORITY_PROJECTS.
- If the user asks what projects a certain user is working on, use QUERY_USER_PROJECTS with the user's name or ID.
- NEVER generate actions that modify the User table (no CREATE_USER, DELETE_USER, UPDATE_USER, etc.).
- Always respond with valid JSON in this format: { "actions": [...] }
- Do NOT include any text outside the JSON object.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { parts: [{ text: `${systemPrompt}\n\nUser Command: "${prompt}"` }] },
        ],
      }),
    });

    if (!response.ok) {
      return executeFallbackEngine(prompt);
    }

    const resData = await response.json();
    let text = resData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return executeFallbackEngine(prompt);

    if (text.includes("```json")) text = text.split("```json")[1] || text;
    if (text.includes("```")) text = text.split("```")[0] || text;

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1)
      text = text.substring(firstBrace, lastBrace + 1);

    const parsed = JSON.parse(text.trim());

    // Validate that parsed result has actions array
    if (!parsed.actions || !Array.isArray(parsed.actions)) {
      return executeFallbackEngine(prompt);
    }

    return parsed;
  } catch (error: any) {
    return executeFallbackEngine(prompt);
  }
};
