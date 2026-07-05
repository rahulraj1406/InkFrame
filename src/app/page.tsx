'use client';

import { useState, useRef, useEffect } from 'react';
import { loadCbZFile, ComicBook, ComicPage } from '@/lib/comic';
import type { Panel } from '@/lib/detector';
import { UploadCloud, ChevronRight, ChevronLeft, Loader2, BookOpen } from 'lucide-react';

export default function Home() {
  const [comic, setComic] = useState<ComicBook | null>(null);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [currentPanelIdx, setCurrentPanelIdx] = useState(-1);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Initialize App');

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Load detector on mount dynamically to avoid SSR issues
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
    
    // When page changes, detect panels
    const runDetection = async () => {
      if (!imgRef.current) return;
      setLoading(true);
      setStatusText('Detecting panels...');
      try {
        const { detectPanels } = await import('@/lib/detector');
        const result = await detectPanels(imgRef.current);
        const parsedPanels = result.panels.length === 0 ? [{ l: 0, t: 0, r: 1, b: 1 }] : result.panels;
        setPanels(parsedPanels);
        
        // If we navigated backwards, start at the last panel. Otherwise, start at the first.
        setCurrentPanelIdx(prev => (prev === -2 ? parsedPanels.length - 1 : 0));
      } catch (err) {
        console.error('Detection failed', err);
        setPanels([{ l: 0, t: 0, r: 1, b: 1 }]);
      }
      setLoading(false);
      setStatusText('');
    };

    // Need to wait for image to actually load in the DOM
    const img = imgRef.current;
    if (img) {
      if (img.complete && img.naturalWidth > 0) {
        runDetection();
      } else {
        img.onload = runDetection;
      }
    }
  }, [comic, currentPageIdx]);

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
    if (currentPanelIdx < panels.length - 1) {
      // Step to next panel
      setCurrentPanelIdx(prev => prev + 1);
    } else if (currentPageIdx < comic.pages.length - 1) {
      // Step to next page
      setCurrentPageIdx(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (!comic) return;
    if (currentPanelIdx > 0) {
      // Step back panel
      setCurrentPanelIdx(prev => prev - 1);
    } else if (currentPageIdx > 0) {
      // Step back page, and flag to start at the last panel
      setCurrentPanelIdx(-2);
      setCurrentPageIdx(prev => prev - 1);
    }
  };

  // Calculate viewport styles based on current panel
  const getViewportStyle = () => {
    if (currentPanelIdx < 0 || panels.length === 0) {
      return { transform: 'scale(1) translate(0%, 0%)', transformOrigin: 'center' };
    }
    
    const panel = panels[currentPanelIdx];
    const width = panel.r - panel.l;
    const height = panel.b - panel.t;
    
    // Zoom tighter for depth effect
    const scale = Math.min(1 / width, 1 / height) * 1.05;
    
    // Calculate center of panel
    const cx = (panel.l + panel.r) / 2;
    const cy = (panel.t + panel.b) / 2;

    return {
      transform: `scale(${scale}) translate(${(0.5 - cx) * 100}%, ${(0.5 - cy) * 100}%)`,
      transformOrigin: 'center',
      transition: 'transform 0.5s cubic-bezier(0.2, 0, 0, 1)'
    };
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 font-sans selection:bg-rose-500">
      
      {/* Navbar */}
      <header className="p-4 flex items-center justify-between border-b border-stone-800 bg-stone-950 shadow-xl z-50 relative">
        <div className="flex items-center gap-3">
          <BookOpen className="text-rose-500 w-6 h-6" />
          <h1 className="font-bold text-xl tracking-tight text-white uppercase">InkFrame</h1>
        </div>
        
        {!comic && (
          <label className="bg-rose-600 hover:bg-rose-500 transition px-4 py-2 rounded-md font-medium cursor-pointer flex items-center gap-2">
            <UploadCloud className="w-5 h-5" />
            Open CBZ
            <input type="file" accept=".cbz" className="hidden" onChange={handleFileUpload} />
          </label>
        )}
      </header>

      {/* Main Content */}
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

        {comic && (
          <div className="w-full h-full relative cursor-pointer" onClick={nextStep}>
            
            {/* The Reader Viewport */}
            <div className="absolute inset-0 flex items-center justify-center w-full h-full">
               <div 
                 className="relative will-change-transform"
                 style={getViewportStyle()}
               >
                 <img 
                   ref={imgRef}
                   src={comic.pages[currentPageIdx]?.url} 
                   alt={`Page ${currentPageIdx + 1}`}
                   className="max-w-[100vw] max-h-[100vh] object-contain shadow-2xl"
                 />
                 
                 {/* Debug: Draw bounding boxes if needed */}
                 {/* {panels.map((p, i) => (
                    <div key={i} className="absolute border-2 border-red-500/50" style={{
                      left: `${p.l * 100}%`, top: `${p.t * 100}%`,
                      width: `${(p.r - p.l) * 100}%`, height: `${(p.b - p.t) * 100}%`
                    }}/>
                 ))} */}
               </div>
            </div>

            {/* Navigation Overlay */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-stone-900/80 backdrop-blur px-6 py-3 rounded-full border border-stone-700 shadow-2xl" onClick={e => e.stopPropagation()}>
              <button 
                onClick={prevStep}
                disabled={currentPageIdx === 0 && currentPanelIdx === -1}
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
              <div className="absolute top-4 right-4 bg-stone-900/80 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-stone-800">
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
