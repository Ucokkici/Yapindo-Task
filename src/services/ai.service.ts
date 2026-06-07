import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const executeFallbackEngine = (prompt: string) => {
  console.log(
    "🔄 [FALLBACK LAYER ACTIVE]: Memproses perintah secara lokal dengan segmentasi cerdas...",
  );

  const responsePayload: { actions: any[] } = { actions: [] };

  const normalizedPrompt = prompt.toLowerCase();
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
  const systemPrompt = `You are an AI converting text to JSON array of actions. CREATE_TASK, UPDATE_TASK, DELETE_TASK only. JSON format.`;

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

    return JSON.parse(text.trim());
  } catch (error: any) {
    return executeFallbackEngine(prompt);
  }
};
