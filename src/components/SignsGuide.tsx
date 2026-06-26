import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Info, Check, Sparkles, BookOpen } from 'lucide-react';

interface SignsGuideProps {
  onClose: () => void;
  onTryLetter?: (letter: string) => void;
}

export const SignsGuide: React.FC<SignsGuideProps> = ({ onClose, onTryLetter }) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<"todos" | "vogais" | "consoantes">("todos");
  const [selectedLetter, setSelectedLetter] = useState<string | null>("A");

  const isVowel = (l: string) => ["A", "E", "I", "O", "U"].includes(l);

  const filteredLetters = letters.filter((l) => {
    const matchesSearch = l.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          getLetterDescription(l).toLowerCase().includes(searchTerm.toLowerCase());
    if (selectedTab === "vogais") return matchesSearch && isVowel(l);
    if (selectedTab === "consoantes") return matchesSearch && !isVowel(l);
    return matchesSearch;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="bg-slate-950 border border-white/10 rounded-3xl p-4 sm:p-6 w-full max-w-5xl h-[90vh] sm:h-[85vh] flex flex-col shadow-2xl relative overflow-hidden"
      >
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header */}
        <div className="flex justify-between items-center mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <BookOpen size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Manual Visual de LIBRAS</h2>
              <p className="text-xs text-slate-400 hidden sm:block">Aprenda a fazer a forma de cada letra usando suas mãos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-300 transition-all hover:rotate-90 duration-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 relative z-10">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Pesquise por uma letra ou descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-white/5 rounded-2xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all focus:ring-1 focus:ring-emerald-500/20"
            />
          </div>
          <div className="flex bg-slate-900 p-1 rounded-2xl border border-white/5 shrink-0 self-stretch sm:self-auto">
            {(["todos", "vogais", "consoantes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`flex-1 sm:flex-initial px-4 py-1.5 text-xs font-semibold rounded-xl capitalize transition-all ${
                  selectedTab === tab
                    ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Split Content */}
        <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden relative z-10">
          {/* Alphabet Grid */}
          <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 custom-scrollbar min-h-[40%] md:min-h-0">
            {filteredLetters.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                <Info size={32} className="mb-2 text-slate-600" />
                <p className="text-sm">Nenhuma letra encontrada para a busca.</p>
              </div>
            ) : (
              filteredLetters.map((letter) => {
                const isSelected = selectedLetter === letter;
                return (
                  <button
                    key={letter}
                    onClick={() => setSelectedLetter(letter)}
                    className={`flex flex-col items-center p-3 rounded-2xl border transition-all relative group ${
                      isSelected
                        ? "bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                        : "bg-slate-900/50 hover:bg-slate-900 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <span className={`text-2xl font-bold mb-2 transition-transform group-hover:scale-110 ${isSelected ? "text-emerald-400" : "text-white"}`}>
                      {letter}
                    </span>
                    <div className="bg-white rounded-xl p-1.5 mb-2 w-full aspect-square flex items-center justify-center overflow-hidden">
                      <img 
                        src={`https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_${letter}.svg`} 
                        alt={`Sinal da letra ${letter}`} 
                        className="w-12 h-12 object-contain"
                        loading="lazy"
                        onError={(e) => {
                           e.currentTarget.style.display = 'none';
                        }}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 truncate w-full text-center">
                      {isVowel(letter) ? "Vogal" : "Consoante"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Letter Detail Panel */}
          <div className="w-full md:w-80 bg-slate-900/80 border border-white/5 rounded-3xl p-5 flex flex-col justify-between shrink-0 h-auto md:h-full overflow-y-auto md:overflow-visible">
            <AnimatePresence mode="wait">
              {selectedLetter ? (
                <motion.div
                  key={selectedLetter}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col h-full justify-between gap-4"
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">Letra Selecionada</span>
                        <h3 className="text-4xl font-extrabold text-white">{selectedLetter}</h3>
                      </div>
                      <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] text-slate-400 font-mono">
                        {isVowel(selectedLetter) ? "Vogal" : "Consoante"}
                      </span>
                    </div>

                    <div className="bg-white rounded-2xl p-6 flex items-center justify-center w-full aspect-video shadow-inner relative group">
                      <img 
                        src={`https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_${selectedLetter}.svg`} 
                        alt={`Sinal da letra ${selectedLetter}`} 
                        className="w-28 h-28 object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Como fazer o gesto:</h4>
                      <div className="bg-slate-950/60 rounded-xl p-3 border border-white/5">
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {getLetterDescription(selectedLetter)}
                        </p>
                      </div>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex items-start gap-2.5">
                      <Info className="text-emerald-400 shrink-0 mt-0.5" size={14} />
                      <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                        Faça o gesto em frente à câmera dentro da área de foco para que o detector reconheça em tempo real.
                      </p>
                    </div>
                  </div>

                  {onTryLetter && (
                    <button
                      onClick={() => {
                        onTryLetter(selectedLetter);
                        onClose();
                      }}
                      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xs font-bold uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/10 active:scale-95 flex items-center justify-center gap-2 mt-2"
                    >
                      <Sparkles size={14} />
                      Treinar esta Letra
                    </button>
                  )}
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 italic py-10">
                  <p className="text-xs text-center">Selecione uma letra para ver detalhes e instruções de treino.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const getLetterDescription = (letter: string) => {
  const descriptions: Record<string, string> = {
    A: "Feche a mão completamente e posicione o polegar esticado ao lado do dedo indicador.",
    B: "Estique todos os quatro dedos para cima, bem juntos, e dobre o polegar sobre a palma da mão.",
    C: "Curve a mão em formato semicircular, imitando a letra 'C' com todos os dedos e o polegar separados.",
    D: "Aponte o indicador para cima e junte as pontas do polegar, médio, anelar e mindinho formando um círculo.",
    E: "Dobre ligeiramente todos os dedos para baixo, tocando levemente suas pontas na palma da mão.",
    F: "Levante os dedos médio, anelar e mindinho. Cruze o polegar sobre a lateral do dedo indicador que fica dobrado.",
    G: "Aponte o dedo indicador para cima e o polegar para a lateral direita, formando um ângulo de 90 graus.",
    H: "Estique o indicador e o médio para frente, coloque o polegar entre eles e faça um leve movimento de rotação.",
    I: "Feche todos os dedos e mantenha apenas o dedo mindinho totalmente esticado para cima.",
    J: "Com o mindinho esticado, faça um movimento no ar desenhando a curva da letra 'J'.",
    K: "Estique o indicador e o médio para cima abertos em 'V', posicione o polegar entre eles e mova a mão para cima.",
    L: "Estique apenas o indicador para cima e o polegar para o lado, formando um ângulo reto 'L'.",
    M: "Dobre os dedos indicador, médio e anelar para baixo sobre a palma da mão, cobrindo o polegar.",
    N: "Dobre apenas o indicador e o médio para baixo sobre a palma, cobrindo o polegar.",
    O: "Curve todos os dedos tocando suas pontas no polegar, criando um formato fechado de 'O'.",
    P: "Posicione o indicador e médio esticados apontando ligeiramente para baixo, com o polegar apoiado entre eles.",
    Q: "Aponte o polegar e o dedo indicador diretamente para baixo, ligeiramente afastados.",
    R: "Dobre o dedo médio sobre o dedo indicador, cruzando-os enquanto os outros ficam fechados.",
    S: "Feche a mão em um punho completo e posicione o polegar repousando horizontalmente sobre os dedos fechados.",
    T: "Dobre o indicador sobre o polegar colocado por dentro, mantendo os outros três dedos esticados para cima.",
    U: "Estique o indicador e o médio juntos diretamente para cima, com os demais dedos fechados.",
    V: "Mantenha o indicador e o médio esticados para cima e bem separados, formando a letra 'V'.",
    W: "Estique o indicador, médio e anelar para cima e abertos, mantendo apenas o mindinho e polegar unidos.",
    X: "Dobre apenas o dedo indicador em formato de gancho curvado, mantendo a mão fechada e puxe-o para trás.",
    Y: "Estique totalmente apenas o polegar e o dedo mindinho para as laterais, com os dedos centrais fechados.",
    Z: "Use o indicador esticado para desenhar o formato da letra 'Z' no ar à sua frente."
  };
  return descriptions[letter] || "Sinal da letra " + letter;
};
