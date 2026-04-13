import React, { useState, useEffect } from "react";

export default function AdminPanel({ sefirot, glowText }: any) {
  const [selectedSefiraId, setSelectedSefiraId] = useState(sefirot[0].id);
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestionText, setNewQuestionText] = useState("");

  const fetchQuestions = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/preguntas/${selectedSefiraId}`);
      if (response.ok) {
        const data = await response.json();
        setQuestions(data);
      }
    } catch(err) { console.error('Error fetching questions'); }
  };

  useEffect(() => {
    fetchQuestions();
  }, [selectedSefiraId]);

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newQuestionText.trim()) return;
    try {
      const res = await fetch("http://127.0.0.1:8000/preguntas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sefira_id: selectedSefiraId, texto: newQuestionText })
      });
      if(res.ok) {
        setNewQuestionText("");
        fetchQuestions();
      }
    } catch(err) { console.error(err); }
  }

  const handleDeleteQuestion = async (id: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/preguntas/${id}`, { method: "DELETE" });
      if(res.ok) fetchQuestions();
    } catch(err) { console.error(err); }
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-stone-900/40 p-8 rounded-2xl border border-stone-800/50 relative z-10 backdrop-blur-xl">
      <div className="flex items-center gap-4 mb-8">
        <span className="material-symbols-outlined text-amber-300 text-4xl">admin_panel_settings</span>
        <h2 className={`font-serif text-3xl tracking-tight ${glowText}`}>Panel de Administrador - Base de Datos</h2>
      </div>

      <div className="mb-8">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-3 ml-1">Seleccionar Dimensión (Sefira)</label>
        <select 
          value={selectedSefiraId} 
          onChange={(e) => setSelectedSefiraId(e.target.value)}
          className="w-full bg-[#070709] border border-stone-800 rounded-xl p-4 text-stone-300 focus:outline-none focus:border-amber-400/50 transition-colors"
        >
          {sefirot.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name} - {s.pilar}</option>
          ))}
        </select>
      </div>

      <div className="mb-8">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/80 mb-4 border-b border-stone-800/60 pb-2">Preguntas Registradas para {sefirot.find((s:any) => s.id === selectedSefiraId)?.name}</h3>
        {questions.length === 0 ? (
          <p className="text-stone-500 italic text-sm">No hay preguntas de reflexión para esta sefira aún...</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q.id} className="flex justify-between items-center bg-stone-900/70 p-4 rounded-xl border border-stone-800/30">
                <span className="text-stone-300 text-sm font-light leading-relaxed">{q.texto_pregunta}</span>
                <button onClick={() => handleDeleteQuestion(q.id)} className="text-red-400/60 hover:text-red-400 transition-colors shrink-0 ml-4 p-2 rounded-lg hover:bg-red-400/10">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form onSubmit={handleAddQuestion} className="bg-[#070709]/50 p-6 rounded-xl border border-stone-800/30">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400 block mb-3">Añadir nueva pregunta de reflexión</label>
        <textarea 
          value={newQuestionText}
          onChange={(e) => setNewQuestionText(e.target.value)}
          required
          placeholder={`Escribe una pregunta para la dimensión...`}
          className="w-full bg-stone-900/30 border border-stone-800 rounded-xl p-4 text-stone-300 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/50 transition-colors mb-4 min-h-[100px]"
        />
        <button type="submit" className="w-full bg-gradient-to-r from-amber-200 to-amber-400 text-stone-950 font-medium font-serif tracking-wide py-3.5 px-6 rounded-xl shadow-[0_0_20px_rgba(253,230,138,0.2)] hover:shadow-[0_0_30px_rgba(253,230,138,0.4)] hover:-translate-y-0.5 transition-all duration-300">
          GUARDAR PREGUNTA
        </button>
      </form>
    </div>
  );
}