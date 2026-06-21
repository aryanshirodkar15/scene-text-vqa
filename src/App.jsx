import { useState } from "react";
import "./index.css";

const SYSTEM_PROMPT =
  "You are a visual text reasoning assistant. When given an image, first read all text present in it carefully, then answer the user's question based on that text. Be precise and ground your answer in what is actually written in the image.";

const suggestedQuestions = [
  "What does this sign say?",
  "What is the most important information here?",
  "Is there any warning or instruction?",
  "Summarize all text in this image",
];

function App() {
  const [imagePreview, setImagePreview] = useState(null);
  const [base64Image, setBase64Image] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [evidence, setEvidence] = useState("");
  const [loading, setLoading] = useState(false);

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  function handleImage(file) {
    if (!file) return;

    setMediaType(file.type);
    setImagePreview(URL.createObjectURL(file));

    const reader = new FileReader();

    reader.onloadend = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      setBase64Image(base64);
    };

    reader.readAsDataURL(file);

    setAnswer("");
    setExtractedText("");
    setEvidence("");
  }

  async function callGemini(promptText) {
    if (!apiKey) {
      throw new Error(
        "Missing Gemini API key. Add VITE_GEMINI_API_KEY to your .env file."
      );
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: base64Image,
                  },
                },
                {
                  text: promptText,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();

    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") || ""
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!base64Image || !question.trim()) {
      alert("Upload an image and enter a question.");
      return;
    }

    setLoading(true);
    setAnswer("");
    setExtractedText("");
    setEvidence("");

    try {
      const firstPrompt = `
First, extract all readable text from the image.
Then answer the user's question.

Question: ${question}

Return in this exact format:

EXTRACTED_TEXT:
...

ANSWER:
...
`;

      const firstResult = await callGemini(firstPrompt);

      const extractedMatch = firstResult.match(
        /EXTRACTED_TEXT:\s*([\s\S]*?)ANSWER:/i
      );

      const answerMatch = firstResult.match(/ANSWER:\s*([\s\S]*)/i);

      const extracted = extractedMatch
        ? extractedMatch[1].trim()
        : "Could not separate extracted text.";

      const finalAnswer = answerMatch ? answerMatch[1].trim() : firstResult;

      setExtractedText(extracted);
      setAnswer(finalAnswer);

      const evidencePrompt = `
The user's question was:

${question}

The answer was:

${finalAnswer}

Which specific text in the image did you use to answer this?
List only the exact relevant text spans from the image.
`;

      const evidenceResult = await callGemini(evidencePrompt);
      setEvidence(evidenceResult);
    } catch (error) {
      setAnswer("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Scene Text VQA</h1>

        <p className="text-zinc-400 mb-6">
          Upload an image with text and ask a question about it.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-xl font-semibold mb-4">Image Upload</h2>

            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleImage(e.dataTransfer.files[0]);
              }}
              className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-700 rounded-xl p-8 cursor-pointer hover:border-blue-500"
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImage(e.target.files[0])}
              />

              <span className="text-zinc-300">
                Drag image here or click to upload
              </span>
            </label>

            {imagePreview && (
              <img
                src={imagePreview}
                alt="Uploaded preview"
                className="mt-5 rounded-xl max-h-[500px] w-full object-contain bg-black"
              />
            )}
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <h2 className="text-xl font-semibold mb-4">Question</h2>

            {imagePreview && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {suggestedQuestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => setQuestion(q)}
                    className="text-left bg-zinc-800 hover:bg-zinc-700 rounded-lg p-3 text-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about the text in the image..."
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg p-3 outline-none focus:border-blue-500"
              />

              <button
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 rounded-lg p-3 font-semibold"
              >
                {loading ? "Reading and answering..." : "Ask Gemini"}
              </button>
            </form>

            <ResultBox title="Answer" content={answer} />
            <ResultBox title="Extracted Text" content={extractedText} />
            <ResultBox title="Evidence Used" content={evidence} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ResultBox({ title, content }) {
  return (
    <div className="mt-5">
      <h3 className="font-semibold mb-2">{title}</h3>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 min-h-20 whitespace-pre-wrap text-zinc-200">
        {content || "Nothing yet."}
      </div>
    </div>
  );
}

export default App;
