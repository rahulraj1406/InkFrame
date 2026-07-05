'use client';

import { useState, useRef, useEffect } from 'react';
import { loadCbZFile, ComicBook } from '@/lib/comic';
import type { Panel } from '@/lib/detector';
import { UploadCloud, ChevronRight, ChevronLeft, Loader2, BookOpen, MonitorSmartphone, Columns, Rows3, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

type LayoutMode = 'panel' | 'horizontal' | 'vertical';

export default function Home() {
  const [comic, setComic] = useState<ComicBook | null>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [currentPanelIdx, setCurrentPanelIdx] = useState(-1);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initialize App');
  
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('panel');
  const [isRTL, setIsRTL] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setStatusText('Loading AI Model...');
    import('@/lib/detector').then(module => {
      module.initDetector().then(() => {
        setStatusText('Ready. Upload a CBZ file.');
      }).catch(e => {
        console.error(e);
        setStatusText('Failed to load AI Model.');
      });
    });
  }, []);

  useEffect(() => {
    if (!comic) return;
    if (layoutMode === 'vertical') return; // No detection needed in vertical scroll
    
    const runDetection = async () => {
      if (!imgRef.current) return;
      setLoading(true);
      setStatusText('Detecting panels...');
      try {
        const { detectPanels } = await import('@/lib/detector');
        const result = await detectPanels(imgRef.current);
        const parsedPanels = result.panels.length === 0 ? [{ l: 0, t: 0, r: 1, b: 1 }] : result.panels;
        setPanels(parsedPanels);
        
        setCurrentPanelIdx(prev => (prev === -2 ? parsedPanels.length - 1 : 0));
      } catch (err) {
        console.error('Detection failed', err);
        setPanels([{ l: 0, t: 0, r: 1, b: 1 }]);
      }
      setLoading(false);
      setStatusText('');
    };

    const img = imgRef.current;
    if (img) {
      if (img.complete && img.naturalWidth > 0) {
        runDetection();
      } else {
        img.onload = runDetection;
      }
    }
  }, [comic, currentPageIdx, layoutMode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setStatusText('Extracting comic book archive...');
    try {
      const book = await loadCbZFile(file);
      setComic(book);
      setCurrentPageIdx(0);
      setCurrentPanelIdx(0);
    } catch (err) {
      console.error(err);
      setStatusText('Failed to parse CBZ file.');
    }
    setLoading(false);
  };

  const nextStep = () => {
    if (!comic) return;
    if (layoutMode === 'panel') {
      if (currentPanelIdx < panels.length - 1) {
        setCurrentPanelIdx(prev => prev + 1);
      } else if (currentPageIdx < comic.pages.length - 1) {
        setCurrentPageIdx(prev => prev + 1);
      }
    } else if (layoutMode === 'horizontal') {
      if (currentPageIdx < comic.pages.length - 1) {
        setCurrentPageIdx(prev => prev + 1);
      }
    }
  };

  const prevStep = () => {
    if (!comic) return;
    if (layoutMode === 'panel') {
      if (currentPanelIdx > 0) {
        setCurrentPanelIdx(prev => prev - 1);
      } else if (currentPageIdx > 0) {
        setCurrentPanelIdx(-2);
        setCurrentPageIdx(prev => prev - 1);
      }
    } else if (layoutMode === 'horizontal') {
      if (currentPageIdx > 0) {
        setCurrentPageIdx(prev => prev - 1);
      }
    }
  };

  const getViewportStyle = () => {
    if (layoutMode !== 'panel' || currentPanelIdx < 0 || panels.length === 0) {
      return { scale: 1, x: "0%", y: "0%" };
    }
    
    const panel = panels[currentPanelIdx];
    const width = panel.r - panel.l;
    const height = panel.b - panel.t;
    const scale = Math.min(1 / width, 1 / height) * 1.05;
    const cx = (panel.l + panel.r) / 2;
    const cy = (panel.t + panel.b) / 2;

    return {
      scale: scale,
      x: `${(0.5 - cx) * 100}%`,
      y: `${(0.5 - cy) * 100}%`,
    };
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 font-sans selection:bg-rose-500">
      <header className="p-4 flex items-center justify-between border-b border-stone-800 bg-stone-950 shadow-xl z-50 relative">
        <div className="flex items-center gap-3">
          <BookOpen className="text-rose-500 w-6 h-6" />
          <h1 className="font-bold text-xl tracking-tight text-white uppercase">InkFrame</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {comic && (
            <div className="flex items-center bg-stone-900 rounded-md p-1 border border-stone-800">
              <button onClick={() => setLayoutMode('panel')} className={`p-2 rounded ${layoutMode === 'panel' ? 'bg-rose-600' : 'hover:bg-stone-800'}`} title="Panel Mode">
                <MonitorSmartphone className="w-4 h-4" />
              </button>
              <button onClick={() => setLayoutMode('horizontal')} className={`p-2 rounded ${layoutMode === 'horizontal' ? 'bg-rose-600' : 'hover:bg-stone-800'}`} title="Horizontal Spread">
                <Columns className="w-4 h-4" />
              </button>
              <button onClick={() => setLayoutMode('vertical')} className={`p-2 rounded ${layoutMode === 'vertical' ? 'bg-rose-600' : 'hover:bg-stone-800'}`} title="Vertical Scroll">
                <Rows3 className="w-4 h-4" />
              </button>
            </div>
          )}

          {!comic && (
            <label className="bg-rose-600 hover:bg-rose-500 transition px-4 py-2 rounded-md font-medium cursor-pointer flex items-center gap-2">
              <UploadCloud className="w-5 h-5" />
              Open CBZ
              <input type="file" accept=".cbz" className="hidden" onChange={handleFileUpload} />
            </label>
          )}
        </div>
      </header>

      <main className="relative flex flex-col items-center justify-center h-[calc(100vh-73px)] overflow-hidden">
        {!comic && (
          <div className="text-center max-w-md p-8 border border-stone-800 rounded-xl bg-stone-900/50 backdrop-blur">
            <BookOpen className="w-16 h-16 text-stone-700 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Welcome to InkFrame</h2>
            <p className="text-stone-400 mb-6">Read your CBZ comics with automatic panel-by-panel navigation powered by on-device AI.</p>
            {loading && (
              <div className="flex items-center justify-center gap-2 text-rose-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{statusText}</span>
              </div>
            )}
            {!loading && statusText && <p className="text-sm text-stone-500">{statusText}</p>}
          </div>
        )}

        {comic && layoutMode === 'vertical' && (
          <div className="w-full h-full overflow-y-auto bg-black flex flex-col items-center pb-24 pt-8">
            {comic.pages.map((page, i) => (
              <img key={i} src={page.url} alt={`Page ${i + 1}`} className="w-full max-w-4xl object-contain mb-4 shadow-2xl" />
            ))}
          </div>
        )}

        {comic && layoutMode === 'horizontal' && (
          <div className="w-full h-full relative flex items-center justify-center bg-black cursor-pointer" onClick={nextStep}>
            <div className="flex items-center justify-center h-full max-w-6xl w-full p-4 gap-4">
              {currentPageIdx > 0 && !isRTL && (
                <img src={comic.pages[currentPageIdx - 1]?.url} alt={`Page ${currentPageIdx}`} className="h-full object-contain flex-1 w-1/2" />
              )}
              <img src={comic.pages[currentPageIdx]?.url} alt={`Page ${currentPageIdx + 1}`} className="h-full object-contain flex-1 w-1/2" />
              {currentPageIdx > 0 && isRTL && (
                <img src={comic.pages[currentPageIdx - 1]?.url} alt={`Page ${currentPageIdx}`} className="h-full object-contain flex-1 w-1/2" />
              )}
            </div>
            {/* Horizontal Nav Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-stone-900/80 backdrop-blur px-6 py-3 rounded-full border border-stone-700 shadow-2xl" onClick={e => e.stopPropagation()}>
              <button onClick={prevStep} disabled={currentPageIdx === 0} className="p-2 rounded-full hover:bg-stone-700 disabled:opacity-30 transition">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <span className="font-bold text-sm uppercase">Page {currentPageIdx + 1} / {comic.pages.length}</span>
              <button onClick={nextStep} disabled={currentPageIdx === comic.pages.length - 1} className="p-2 rounded-full hover:bg-stone-700 disabled:opacity-30 transition">
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {comic && layoutMode === 'panel' && (
          <div className="w-full h-full relative overflow-hidden" onClick={nextStep}>
            <div className="absolute inset-0 flex items-center justify-center w-full h-full pointer-events-none">
               <motion.div 
                 drag
                 dragConstraints={{ top: -300, left: -300, right: 300, bottom: 300 }}
                 dragElastic={0.2}
                 className="relative will-change-transform cursor-grab active:cursor-grabbing pointer-events-auto"
                 animate={getViewportStyle()}
                 transition={{ type: "spring", stiffness: 80, damping: 20 }}
                 style={{ transformOrigin: 'center' }}
                 onClick={(e) => {
                   e.stopPropagation(); // Prevents image drag from bubbling to the nextStep click
                 }}
               >
                 <img 
                   ref={imgRef}
                   src={comic.pages[currentPageIdx]?.url} 
                   alt={`Page ${currentPageIdx + 1}`}
                   className="max-w-[100vw] max-h-[100vh] object-contain shadow-2xl pointer-events-none"
                 />
               </motion.div>
            </div>

            {/* Click zones for mobile tapping */}
            <div className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer" onClick={nextStep} />
            <div className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer" onClick={(e) => { e.stopPropagation(); prevStep(); }} />

            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-stone-900/80 backdrop-blur px-6 py-3 rounded-full border border-stone-700 shadow-2xl z-20" onClick={e => e.stopPropagation()}>
              <button 
                onClick={prevStep}
                disabled={currentPageIdx === 0 && currentPanelIdx <= 0}
                className="p-2 rounded-full hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <div className="flex flex-col items-center min-w-[120px]">
                <span className="font-bold text-sm tracking-widest uppercase">Page {currentPageIdx + 1} / {comic.pages.length}</span>
                <span className="text-xs text-stone-400">
                  {currentPanelIdx === -1 ? 'Full Page' : `Panel ${currentPanelIdx + 1} of ${panels.length}`}
                </span>
              </div>

              <button 
                onClick={nextStep}
                disabled={currentPageIdx === comic.pages.length - 1 && currentPanelIdx === panels.length - 1}
                className="p-2 rounded-full hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent transition"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {loading && (
              <div className="absolute top-4 right-4 bg-stone-900/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-stone-800 z-20">
                <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                <span className="text-sm font-medium">Detecting...</span>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
