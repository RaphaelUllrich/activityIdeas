import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Check, Sparkles, Heart, X, Loader2, WifiOff, LogOut, Menu, Calendar, List as ListIcon, GripVertical, Pencil, Dices, Coins, Clock, MapPin, Image as ImageIcon, Maximize2, Download, Settings, Moon, Sun, LayoutList, AlignJustify, ExternalLink, RefreshCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { format, addMonths, startOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';

import { DateIdea, CostLevel } from './types';
import { generateDateIdeas } from './services/geminiService';
import { appwriteService, CollectionMeta, mapDoc } from './services/appwrite';
import LoginScreen from './components/LoginScreen';

// Constants
const STANDARD_CATEGORIES: string[] = ['Aktiv', 'Entspannung', 'Essen & Trinken', 'Kultur', 'Reisen', 'Sonstiges'];
const COST_LEVELS: CostLevel[] = ['Kostenlos', '€', '€€', '€€€'];
const DEFAULT_COLLECTIONS = ['Aktivitäten', 'Gerichte', 'Ideen'];
const STORAGE_KEY_COLLECTION = 'datejar_active_collection';
const STORAGE_KEY_SETTINGS = 'datejar_settings';
const STORAGE_KEY_CATEGORIES = 'datejar_custom_categories';

interface AppSettings {
    theme: 'light' | 'dark';
    density: 'standard' | 'compact';
    showConfetti: boolean;
    primaryColorHex: string; // Hex Code (z.B. #f43f5e)
    confirmDelete: boolean; // Sicherheitsabfrage
}

// Helper: Hex zu RGB für Tailwind CSS Variablen (wichtig für Opacity!)
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}` : '244 63 94';
};

// Helper: Haptisches Feedback (funktioniert nur auf Mobilgeräten)
const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10); // Kurze Vibration (10ms)
    }
};

// Component: Skeleton Loading (Platzhalter beim Laden)
const SkeletonItem = () => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-800 animate-pulse">
        <div className="flex gap-3 items-center">
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-700 shrink-0"></div>
            <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
                <div className="flex gap-2">
                    <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-12"></div>
                    <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-8"></div>
                </div>
            </div>
        </div>
    </div>
);

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Data State
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  
  // Custom Categories State
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
      const saved = localStorage.getItem(STORAGE_KEY_CATEGORIES);
      return saved ? JSON.parse(saved) : [];
  });

  // Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      // Standard: Rose 500 (#f43f5e)
      return saved ? JSON.parse(saved) : { theme: 'light', density: 'standard', showConfetti: true, primaryColorHex: '#f43f5e', confirmDelete: true };
  });

  // View State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'planner'>('list');
  
  // COLLECTION STATE
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>(() => {
      return localStorage.getItem(STORAGE_KEY_COLLECTION) || 'Aktivitäten';
  });
  
  // UI Helpers
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Input State for new Category in Settings
  const [newCatInput, setNewCatInput] = useState('');

  // SHUFFLE STATE
  const [pickedIdea, setPickedIdea] = useState<DateIdea | null>(null);
  const [showShuffleModal, setShowShuffleModal] = useState(false);

  // Edit/Add Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DateIdea | null>(null);
  
  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Lightbox State
  const [lightboxImageId, setLightboxImageId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
      title: '',
      category: 'Sonstiges' as string,
      description: '',
      location: '',
      cost: '€' as CostLevel,
      duration: '',
      plannedMonth: '' 
  });

  // FILTERS STATE
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'favorites'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [costFilter, setCostFilter] = useState<CostLevel | 'all'>('all');
  const [durationFilter, setDurationFilter] = useState<string | 'all'>('all');

  // Persistence helpers
  const saveLocal = (items: DateIdea[]) => localStorage.setItem('datejar_ideas', JSON.stringify(items));
  const getLocal = (): DateIdea[] => {
    const s = localStorage.getItem('datejar_ideas');
    return s ? JSON.parse(s) : [];
  };

  // --- EFFECTS ---

  // Auth Init
  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await appwriteService.getUser();
        setUser(currentUser);
        if (currentUser) {
            await loadData();
        } else {
            setIsAuthLoading(false);
        }
      } catch (e) { console.error(e); setIsAuthLoading(false); }
    };
    init();
  }, []);

  // Settings & Theme & Color Logic
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      
      const root = window.document.documentElement;
      
      // 1. Dark Mode Class
      if (settings.theme === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');

      // 2. Dynamic Color Variable (Apply RGB to Body CSS Vars)
      const rgb = hexToRgb(settings.primaryColorHex);
      document.body.style.setProperty('--color-primary', rgb);
      // Wir nutzen die gleiche Farbe auch für Secondary, oder man könnte sie leicht abdunkeln
      document.body.style.setProperty('--color-secondary', rgb);
      
  }, [settings]);

  // Categories Persistence
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(customCategories));
  }, [customCategories]);

  // Collection Persistence
  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_COLLECTION, activeCollection);
  }, [activeCollection]);

  // Realtime Updates
  useEffect(() => {
    if (!user) return; 
    const unsubscribe = appwriteService.subscribe((response) => {
        const eventType = response.events[0]; 
        const payload = response.payload;
        if (response.events.some((e: string) => e.includes('ideas'))) {
            const mappedItem = mapDoc(payload);
            if (eventType.includes('.create')) {
                setIdeas(prev => {
                    if (prev.some(i => i.id === mappedItem.id)) return prev;
                    return [mappedItem, ...prev];
                });
            } else if (eventType.includes('.update')) {
                setIdeas(prev => prev.map(i => i.id === payload.$id ? mappedItem : i));
            } else if (eventType.includes('.delete')) {
                setIdeas(prev => prev.filter(i => i.id !== payload.$id));
            }
        } else if (response.events.some((e: string) => e.includes('collections_meta'))) {
             appwriteService.listCollections().then(setCollections);
        } 
    });
    return () => { unsubscribe(); };
  }, [user]);

  // --- DATA LOADING ---
  const loadData = async () => {
    setLoading(true);
    try {
      let cols = await appwriteService.listCollections();
      if (cols.length === 0) {
          for (const name of DEFAULT_COLLECTIONS) await appwriteService.createCollection(name);
          cols = await appwriteService.listCollections();
      }
      setCollections(cols);
      if (cols.length > 0) {
            const exists = cols.find(c => c.name === activeCollection);
            if (!exists) setActiveCollection(cols[0].name);
      }
      const fetchedIdeas = await appwriteService.listIdeas();
      setIdeas(fetchedIdeas);
      setOfflineMode(false);
    } catch (error) {
      console.warn("Offline", error);
      setOfflineMode(true);
      setIdeas(getLocal());
      setCollections(DEFAULT_COLLECTIONS.map((n, i) => ({ $id: `local-${i}`, name: n })));
    } finally {
      setLoading(false);
      setIsAuthLoading(false);
    }
  };

  // --- HANDLERS ---

  const handleAddCategory = () => {
      if (!newCatInput.trim()) return;
      if (allCategories.includes(newCatInput.trim())) {
          alert('Kategorie existiert bereits');
          return;
      }
      setCustomCategories([...customCategories, newCatInput.trim()]);
      setNewCatInput('');
  };

  const handleDeleteCategory = (cat: string) => {
      if (window.confirm(`Kategorie "${cat}" entfernen?`)) {
          setCustomCategories(customCategories.filter(c => c !== cat));
      }
  };

  const handleLogout = async () => {
      await appwriteService.logout();
      setUser(null);
      setIdeas([]);
      localStorage.removeItem(STORAGE_KEY_COLLECTION);
      window.location.reload(); 
  };

  const handleAddCollection = async () => {
      const name = prompt("Name der neuen Sammlung (z.B. 'Filme'):");
      if (!name) return;
      try {
          const newCol = await appwriteService.createCollection(name);
          setCollections([...collections, newCol]);
          setActiveCollection(newCol.name);
          setSidebarOpen(false);
      } catch (e) { alert("Fehler beim Erstellen der Sammlung"); }
  };

  const handleDeleteCollection = async (id: string, name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`Warnung: Sammlung "${name}" und ALLE Einträge darin werden gelöscht!`)) return;
      try {
          await appwriteService.deleteCollection(id, name);
          const newCols = collections.filter(c => c.$id !== id);
          setCollections(newCols);
          setIdeas(prev => prev.filter(i => i.type !== name));
          if (activeCollection === name && newCols.length > 0) setActiveCollection(newCols[0].name);
      } catch (e) { alert("Löschen fehlgeschlagen"); }
  };

  const handleRenameCollection = async (id: string, oldName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const newName = prompt("Neuer Name:", oldName);
      if (!newName || newName === oldName) return;
      try {
          await appwriteService.renameCollection(id, oldName, newName);
          setCollections(prev => prev.map(c => c.$id === id ? { ...c, name: newName } : c));
          setIdeas(prev => prev.map(i => i.type === oldName ? { ...i, type: newName } : i));
          if (activeCollection === oldName) setActiveCollection(newName);
      } catch (e) { alert("Umbenennen fehlgeschlagen"); }
  };

  const openModal = (item?: DateIdea) => {
      setSelectedFile(null);
      setPreviewUrl(null);
      triggerHaptic();

      if (item) {
          setEditingItem(item);
          setFormData({
              title: item.title,
              category: allCategories.includes(item.category) ? item.category : 'Sonstiges',
              description: item.description || '',
              location: item.location || '',
              cost: item.cost || '€',
              duration: item.duration || '',
              plannedMonth: item.plannedMonth || ''
          });
      } else {
          setEditingItem(null);
          setFormData({
              title: '',
              category: 'Sonstiges',
              description: '',
              location: '',
              cost: '€',
              duration: '',
              plannedMonth: ''
          });
      }
      setShowModal(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    let uploadedImageId = editingItem?.imageId; 
    if (selectedFile) {
        try { uploadedImageId = await appwriteService.uploadImage(selectedFile); } 
        catch(err) { alert("Bild-Upload fehlgeschlagen"); return; }
    }

    const commonPayload = {
      title: formData.title.trim(),
      category: formData.category,
      description: formData.description,
      location: formData.location,
      cost: formData.cost,
      duration: formData.duration,
      type: activeCollection,
      plannedMonth: formData.plannedMonth || undefined,
      imageId: uploadedImageId
    };

    if (editingItem) {
        const updatedItem = { ...editingItem, ...commonPayload };
        setIdeas(prev => prev.map(i => i.id === editingItem.id ? updatedItem : i));
        setShowModal(false);
        if(!offlineMode) {
            try { await appwriteService.updateIdea(editingItem.id, commonPayload); } 
            catch(e) { console.error(e); setOfflineMode(true); }
        } else {
            saveLocal(ideas.map(i => i.id === editingItem.id ? updatedItem : i));
        }
    } else {
        const tempId = 'temp-' + Date.now();
        const maxOrder = Math.max(...ideas.map(i => i.order || 0), 0);
        const newItem = {
            ...commonPayload,
            id: tempId,
            createdBy: user?.name || user?.email || 'Anonymous',
            completed: false,
            isFavorite: false,
            createdAt: Date.now(),
            order: maxOrder + 1,
            type: activeCollection
        };
        setShowModal(false);
        if (!offlineMode) {
            try { await appwriteService.addIdea(newItem); } 
            catch (e) { 
                console.error(e); setOfflineMode(true); 
                setIdeas([newItem, ...ideas]); saveLocal([newItem, ...ideas]); 
            }
        } else {
            const newIdeas = [newItem, ...ideas];
            setIdeas(newIdeas); saveLocal(newIdeas);
        }
    }
  };

  const deleteItem = async (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    // Security Prompt Check
    if (settings.confirmDelete && !window.confirm('Wirklich löschen?')) return;
    
    triggerHaptic();
    const newIdeas = ideas.filter(item => item.id !== id);
    setIdeas(newIdeas);

    if (!offlineMode) {
      try { await appwriteService.deleteIdea(id); } catch (e) { setOfflineMode(true); }
    }
    saveLocal(newIdeas);
  };

  const toggleComplete = async (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    triggerHaptic();
    const item = ideas.find(i => i.id === id);
    if (!item) return;

    const isCompleting = !item.completed;
    const newIdeas = ideas.map(i => i.id === id ? { ...i, completed: isCompleting } : i);
    setIdeas(newIdeas);
    
    if (isCompleting && settings.showConfetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: [settings.primaryColorHex, '#fda4af'] });

    if (!offlineMode) {
        try { await appwriteService.updateIdea(id, { completed: isCompleting }); } catch(e) { setOfflineMode(true); }
    }
    saveLocal(newIdeas);
  };

  const toggleFavorite = async (id: string, e?: React.MouseEvent) => {
      if(e) e.stopPropagation();
      triggerHaptic();
      const item = ideas.find(i => i.id === id);
      if (!item) return;
      const isFav = !item.isFavorite;
      const newIdeas = ideas.map(i => i.id === id ? { ...i, isFavorite: isFav } : i);
      setIdeas(newIdeas);
      if (!offlineMode) {
          try { await appwriteService.updateIdea(id, { isFavorite: isFav }); } catch(e) { setOfflineMode(true); }
      }
      saveLocal(newIdeas);
  };

  const handleShuffle = () => {
    triggerHaptic();
    const pool = currentCollectionIdeas.filter(i => !i.completed);
    if (pool.length === 0) {
        alert("Keine offenen Ideen in dieser Sammlung vorhanden!");
        return;
    }
    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    setPickedIdea(randomItem);
    setShowShuffleModal(true);
    if(settings.showConfetti) confetti({ particleCount: 150, spread: 100, origin: { y: 0.7 }, colors: ['#FFD700', settings.primaryColorHex, '#4F46E5'] });
  };

  const onDragEnd = async (result: DropResult) => {
      if (!result.destination) return;
      const sourceIndex = result.source.index;
      const destIndex = result.destination.index;
      if (sourceIndex === destIndex) return;

      const reorderedList: DateIdea[] = Array.from(filteredIdeas);
      const [movedItem] = reorderedList.splice(sourceIndex, 1);
      if (!movedItem) return;
      reorderedList.splice(destIndex, 0, movedItem);

      const updatedIdeas = ideas.map(idea => {
          const newIndex = reorderedList.findIndex(i => i.id === idea.id);
          if (newIndex !== -1) return { ...idea, order: newIndex };
          return idea;
      });
      setIdeas(updatedIdeas);
      if (!offlineMode) {
          try { 
            const updates = reorderedList.map((item, index) => appwriteService.updateIdea(item.id, { order: index }));
            Promise.all(updates).catch(console.error);
          } catch(e) { console.error(e); }
      }
  };

  const handleAiGenerate = async () => {
    setIsAiLoading(true);
    try {
      const titles = ideas.filter(i => i.type === activeCollection).map(i => i.title);
      const suggestions = await generateDateIdeas(titles);
      if(!offlineMode) {
         const promises = suggestions.map((s, idx) => appwriteService.addIdea({
             ...s, createdBy: 'Gemini AI', completed: false, isFavorite: false, createdAt: Date.now() + idx, type: activeCollection, order: 0
         }));
         await Promise.all(promises);
      }
      setShowModal(false);
    } catch (e) { alert('Fehler bei AI Generierung'); } finally { setIsAiLoading(false); }
  };

  // --- DERIVED DATA ---
  const allCategories = useMemo(() => [...STANDARD_CATEGORIES, ...customCategories].sort(), [customCategories]);
  const currentCollectionIdeas = ideas.filter(i => (i.type || 'Aktivitäten') === activeCollection);
  
  const availableCategories = useMemo(() => {
    const cats = new Set(allCategories);
    currentCollectionIdeas.forEach(i => cats.add(i.category));
    return Array.from(cats).sort();
  }, [currentCollectionIdeas, allCategories]);

  const availableDurations = useMemo(() => {
    const durs = new Set<string>();
    currentCollectionIdeas.forEach(i => { if(i.duration) durs.add(i.duration) });
    return Array.from(durs).sort();
  }, [currentCollectionIdeas]);

  const filteredIdeas = currentCollectionIdeas.filter(item => {
    if (viewMode === 'planner') return true; 
    let statusMatch = true;
    if (statusFilter === 'active') statusMatch = !item.completed;
    if (statusFilter === 'completed') statusMatch = item.completed;
    if (statusFilter === 'favorites') statusMatch = item.isFavorite === true;

    const catMatch = categoryFilter === 'all' ? true : item.category === categoryFilter;
    const costMatch = costFilter === 'all' ? true : item.cost === costFilter;
    const durMatch = durationFilter === 'all' ? true : item.duration === durationFilter;
    return statusMatch && catMatch && costMatch && durMatch;
  }).sort((a, b) => (a.order || 0) - (b.order || 0));

  const getCategoryColor = (cat: string) => {
    if(['Aktiv', 'Kultur'].includes(cat)) return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
    if(['Entspannung'].includes(cat)) return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    if(['Essen & Trinken'].includes(cat)) return 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const getMonths = () => Array.from({ length: 12 }, (_, i) => addMonths(startOfMonth(new Date()), i));

  // --- RENDER ---
  if (isAuthLoading) return <div className="h-screen flex items-center justify-center bg-rose-50 dark:bg-slate-950"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return <LoginScreen onLoginSuccess={setUser} />;

  return (
    <div className="min-h-screen bg-rose-50 dark:bg-slate-950 relative flex overflow-hidden transition-colors duration-300">
      
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col h-full text-gray-800 dark:text-white">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">Sammlungen</h2>
                <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-6 h-6" /></button>
            </div>
            
            <nav className="flex-1 space-y-2 overflow-y-auto">
                {collections.map(col => (
                    <div key={col.$id} className={`w-full group px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-between cursor-pointer ${activeCollection === col.name ? 'bg-primary/10 text-primary' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                        onClick={() => { setActiveCollection(col.name); setSidebarOpen(false); }}>
                        <span>{col.name}</span>
                        <div className="flex items-center gap-1">
                            {activeCollection === col.name && <Check className="w-4 h-4 mr-2" />}
                            <button onClick={(e) => handleRenameCollection(col.$id, col.name, e)} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Pencil className="w-3 h-3" /></button>
                            {collections.length > 1 && <button onClick={(e) => handleDeleteCollection(col.$id, col.name, e)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-white dark:hover:bg-slate-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>}
                        </div>
                    </div>
                ))}
            </nav>

            <button onClick={handleAddCollection} className="mt-4 flex items-center gap-2 text-gray-500 dark:text-slate-500 hover:text-primary px-2 font-medium"><Plus className="w-5 h-5" /><span>Neue Sammlung</span></button>

            <div className="border-t border-gray-100 dark:border-slate-800 mt-6 pt-4 space-y-2">
                 <button onClick={() => { setSettingsOpen(true); setSidebarOpen(false); }} className="flex items-center gap-3 text-gray-600 dark:text-slate-400 hover:text-primary w-full px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition"><Settings className="w-5 h-5" /><span>Einstellungen</span></button>
                 <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-red-500 w-full px-2 py-2"><LogOut className="w-5 h-5" /><span>Abmelden</span></button>
            </div>
        </div>
      </aside>

      {/* SETTINGS MODAL */}
      {settingsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setSettingsOpen(false)}>
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-gray-800 dark:text-white">Einstellungen</h2>
                      <button onClick={() => setSettingsOpen(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400"><X className="w-5 h-5"/></button>
                  </div>

                  <div className="space-y-6">
                      {/* Theme */}
                      <div>
                          <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase mb-3 block">Modus</label>
                          <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-xl flex">
                              <button onClick={() => setSettings({...settings, theme: 'light'})} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${settings.theme === 'light' ? 'bg-white shadow text-gray-900' : 'text-gray-500 dark:text-slate-400'}`}><Sun className="w-4 h-4" /> Hell</button>
                              <button onClick={() => setSettings({...settings, theme: 'dark'})} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${settings.theme === 'dark' ? 'bg-slate-700 shadow text-white' : 'text-gray-500 dark:text-slate-400'}`}><Moon className="w-4 h-4" /> Dunkel</button>
                          </div>
                      </div>

                      {/* Accent Color (Free Picker) */}
                      <div>
                          <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase mb-3 block">Design Farbe</label>
                          <div className="flex items-center gap-4">
                              <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 dark:border-slate-700 shadow-sm cursor-pointer hover:scale-105 transition-transform">
                                  <input type="color" value={settings.primaryColorHex} onChange={(e) => setSettings({...settings, primaryColorHex: e.target.value})} className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-150" />
                              </div>
                              <span className="text-sm font-medium text-gray-700 dark:text-slate-300 font-mono">{settings.primaryColorHex}</span>
                          </div>
                      </div>

                      {/* Density */}
                      <div>
                          <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase mb-3 block">Ansicht</label>
                          <div className="bg-gray-100 dark:bg-slate-800 p-1 rounded-xl flex">
                              <button onClick={() => setSettings({...settings, density: 'standard'})} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${settings.density === 'standard' ? 'bg-white dark:bg-slate-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}><LayoutList className="w-4 h-4" /> Groß</button>
                              <button onClick={() => setSettings({...settings, density: 'compact'})} className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition ${settings.density === 'compact' ? 'bg-white dark:bg-slate-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}><AlignJustify className="w-4 h-4" /> Klein</button>
                          </div>
                      </div>

                      {/* Category Manager */}
                      <div>
                          <label className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase mb-3 block">Kategorien verwalten</label>
                          <div className="flex gap-2 mb-3">
                              <input type="text" value={newCatInput} onChange={(e) => setNewCatInput(e.target.value)} placeholder="Neue Kategorie..." className="flex-1 px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
                              <button onClick={handleAddCategory} className="bg-primary text-white p-2 rounded-lg"><Plus className="w-5 h-5"/></button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                              {customCategories.map(cat => (
                                  <span key={cat} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-md text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                                      {cat}
                                      <button onClick={() => handleDeleteCategory(cat)} className="hover:text-red-500"><X className="w-3 h-3"/></button>
                                  </span>
                              ))}
                              {customCategories.length === 0 && <span className="text-xs text-gray-400 italic">Keine eigenen Kategorien.</span>}
                          </div>
                      </div>

                      {/* Toggles */}
                      <div className="space-y-3 pt-2">
                           <div className="flex items-center justify-between">
                              <span className="text-gray-700 dark:text-slate-300 font-medium text-sm">Sicherheitsabfrage beim Löschen</span>
                              <button onClick={() => setSettings({...settings, confirmDelete: !settings.confirmDelete})} className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${settings.confirmDelete ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-700'}`}>
                                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.confirmDelete ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                          </div>
                          <div className="flex items-center justify-between">
                              <span className="text-gray-700 dark:text-slate-300 font-medium text-sm">Konfetti-Effekt</span>
                              <button onClick={() => setSettings({...settings, showConfetti: !settings.showConfetti})} className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${settings.showConfetti ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-700'}`}>
                                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.showConfetti ? 'translate-x-4' : 'translate-x-0'}`} />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Main Content */}
      <div className="flex-1 h-screen overflow-hidden flex flex-col">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm z-10 shrink-0 border-b border-gray-100 dark:border-slate-800 transition-colors duration-300">
            <div className="max-w-2xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-600 dark:text-slate-300"><Menu className="w-6 h-6" /></button>
                        <div>
                             <h1 className="text-xl font-bold text-gray-800 dark:text-white">{activeCollection}</h1>
                             <p className="text-xs text-gray-500 dark:text-slate-400">{filteredIdeas.length} Einträge</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         <button onClick={handleShuffle} className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-300 shadow-sm active:scale-90 transition-transform hover:bg-indigo-200 dark:hover:bg-indigo-800"><Dices className="w-6 h-6" /></button>
                         <button onClick={() => setViewMode(viewMode === 'list' ? 'planner' : 'list')} className="p-2 rounded-full bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300">{viewMode === 'list' ? <Calendar className="w-5 h-5" /> : <ListIcon className="w-5 h-5" />}</button>
                         <button onClick={() => openModal()} className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform hover:opacity-90"><Plus className="w-6 h-6" /></button>
                    </div>
                </div>

                {/* Filter Bar */}
                {viewMode === 'list' && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <div className="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-lg shrink-0 transition-colors">
                            {(['active', 'completed', 'favorites', 'all'] as const).map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${statusFilter === s ? 'bg-white dark:bg-slate-600 text-gray-800 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}>
                                    {s === 'active' ? 'Offen' : s === 'completed' ? 'Erledigt' : s === 'favorites' ? 'Favoriten' : 'Alle'}
                                </button>
                            ))}
                        </div>
                        <div className="w-px bg-gray-200 dark:bg-slate-700 my-1 shrink-0"></div>
                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={`px-3 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer outline-none transition-colors ${categoryFilter !== 'all' ? 'bg-primary text-white border-primary' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                            <option value="all">Kategorie</option>
                            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select value={costFilter} onChange={(e) => setCostFilter(e.target.value as any)} className={`px-3 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer outline-none transition-colors ${costFilter !== 'all' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                            <option value="all">Preis</option>
                            {COST_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                )}
            </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-rose-50/50 dark:bg-slate-950 p-4 transition-colors duration-300">
            {viewMode === 'list' && (
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="list">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="max-w-md mx-auto space-y-3 pb-20">
                                {/* SKELETON LOADING */}
                                {loading && Array.from({length: 3}).map((_, i) => <SkeletonItem key={i} />)}
                                
                                {!loading && filteredIdeas.length === 0 && (
                                    <div className="text-center py-12 opacity-40 text-gray-400 dark:text-slate-600"><Heart className="w-16 h-16 mx-auto mb-2" /><p>Nichts gefunden.</p></div>
                                )}
                                {!loading && filteredIdeas.map((item, index) => (
                                    <Draggable // @ts-expect-error
                                        key={item.id} draggableId={item.id} index={index}>
                                        {(provided, snapshot) => (
                                            <div ref={provided.innerRef} {...provided.draggableProps} className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-rose-50 dark:border-slate-800 overflow-hidden transition-colors ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary rotate-2' : ''} ${item.completed ? 'opacity-60 bg-gray-50 dark:bg-slate-950' : ''}`}>
                                                <div className={`${settings.density === 'compact' ? 'p-2' : 'p-3'} flex items-center gap-3`}>
                                                    <div {...provided.dragHandleProps} className="text-gray-300 dark:text-slate-600 cursor-grab active:cursor-grabbing"><GripVertical className="w-5 h-5" /></div>
                                                    <button onClick={(e) => toggleComplete(item.id, e)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${item.completed ? 'bg-green-500 border-green-500' : 'border-rose-200 dark:border-slate-600'}`}>{item.completed && <Check className="w-3.5 h-3.5 text-white" />}</button>
                                                    <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                                                        <div className="flex justify-between items-center">
                                                            <h3 className={`font-medium text-gray-800 dark:text-gray-100 truncate ${item.completed ? 'line-through text-gray-400 dark:text-slate-500' : ''}`}>{item.title}</h3>
                                                            <div className="flex items-center gap-1">
                                                                <button onClick={(e) => toggleFavorite(item.id, e)} className="p-1.5 rounded-full hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-400 dark:text-slate-500 transition-colors">
                                                                    <Heart className={`w-4 h-4 ${item.isFavorite ? 'fill-primary text-primary' : ''}`} />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); openModal(item); }} className="text-gray-400 hover:text-primary dark:text-slate-500 dark:hover:text-primary p-1"><Pencil className="w-4 h-4" /></button>
                                                            </div>
                                                        </div>
                                                        {settings.density === 'standard' && (
                                                            <div className="flex gap-2 mt-1">
                                                                <span className={`text-[10px] px-1.5 rounded font-semibold ${getCategoryColor(item.category)}`}>{item.category}</span>
                                                                {item.cost && <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-1.5 rounded flex items-center gap-0.5"><Coins className="w-3 h-3"/> {item.cost}</span>}
                                                                {item.duration && <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 rounded flex items-center gap-0.5"><Clock className="w-3 h-3"/> {item.duration}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {expandedId === item.id && (
                                                    <div className="px-4 pb-4 pt-0 text-sm text-gray-600 dark:text-gray-300 space-y-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 mt-2">
                                                        {settings.density === 'compact' && (
                                                             <div className="flex gap-2 mt-3 mb-2">
                                                                <span className={`text-[10px] px-1.5 rounded font-semibold ${getCategoryColor(item.category)}`}>{item.category}</span>
                                                                {item.cost && <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 px-1.5 rounded flex items-center gap-0.5"><Coins className="w-3 h-3"/> {item.cost}</span>}
                                                                {item.duration && <span className="text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 rounded flex items-center gap-0.5"><Clock className="w-3 h-3"/> {item.duration}</span>}
                                                            </div>
                                                        )}
                                                        {item.description && <p className={`mt-2 italic ${settings.density === 'standard' ? 'pt-2' : ''}`}>{item.description}</p>}
                                                        {item.imageId && (
                                                            <div className="mt-3 relative group w-full h-40 rounded-xl overflow-hidden cursor-pointer shadow-sm border border-gray-200 dark:border-slate-700" onClick={(e) => { e.stopPropagation(); setLightboxImageId(item.imageId!); }}>
                                                                <img src={appwriteService.getImageView(item.imageId).href} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Beleg" />
                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"><Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" /></div>
                                                            </div>
                                                        )}
                                                        <div className="flex gap-4 text-xs mt-2 text-gray-500 dark:text-slate-400">
                                                            {item.location && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-primary underline decoration-dotted underline-offset-2"><MapPin className="w-3 h-3" />{item.location}<ExternalLink className="w-2.5 h-2.5 opacity-50" /></a>}
                                                            {item.plannedMonth && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{item.plannedMonth}</span>}
                                                        </div>
                                                        <div className="flex justify-end pt-2"><button onClick={(e) => deleteItem(item.id, e)} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1"><Trash2 className="w-3 h-3"/> Löschen</button></div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            )}

            {viewMode === 'planner' && (
                <div className="flex gap-4 overflow-x-auto pb-6 h-full items-start no-scrollbar">
                    <div className="w-72 shrink-0 flex flex-col h-full bg-gray-100/50 dark:bg-slate-900/50 rounded-2xl p-2 transition-colors">
                        <h3 className="font-bold text-gray-500 dark:text-slate-400 mb-3 px-2 sticky top-0">Ungeplant</h3>
                        <div className="space-y-2 overflow-y-auto flex-1">
                            {currentCollectionIdeas.filter(i => !i.plannedMonth && !i.completed).map(item => (
                                <div key={item.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
                                    <div className="font-medium text-sm text-gray-800 dark:text-gray-100">{item.title}</div>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className={`text-[10px] px-1.5 rounded ${getCategoryColor(item.category)}`}>{item.category}</span>
                                        <button onClick={() => openModal(item)}><Pencil className="w-3 h-3 text-gray-400 dark:text-slate-500 hover:text-primary"/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {getMonths().map(date => {
                        const monthStr = format(date, 'yyyy-MM');
                        const displayStr = format(date, 'MMMM yyyy', { locale: de });
                        const monthItems = currentCollectionIdeas.filter(i => i.plannedMonth === monthStr);
                        return (
                            <div key={monthStr} className="w-72 shrink-0 flex flex-col h-full bg-white dark:bg-slate-900 rounded-2xl border border-rose-100 dark:border-slate-800 p-2 shadow-sm transition-colors">
                                <h3 className="font-bold text-primary mb-3 px-2 sticky top-0 flex justify-between">{displayStr}<span className="text-xs bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{monthItems.length}</span></h3>
                                <div className="space-y-2 overflow-y-auto flex-1">
                                    {monthItems.map(item => (
                                        <div key={item.id} className={`bg-rose-50 dark:bg-slate-800 p-3 rounded-xl border border-rose-100 dark:border-slate-700 ${item.completed ? 'opacity-50' : ''}`}>
                                            <div className="font-medium text-sm text-gray-800 dark:text-gray-100">{item.title}</div>
                                            <div className="flex justify-between items-center mt-2">
                                                 <span className={`text-[10px] px-1.5 rounded ${getCategoryColor(item.category)}`}>{item.category}</span>
                                                 <button onClick={() => openModal(item)}><Pencil className="w-3 h-3 text-gray-400 dark:text-slate-500 hover:text-primary"/></button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl p-4 text-center text-xs text-gray-400 dark:text-slate-600">+ Planen</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">{editingItem ? 'Bearbeiten' : 'Neu erstellen'}</h2>
                  <button onClick={() => setShowModal(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full text-gray-600 dark:text-slate-400"><X className="w-5 h-5"/></button>
               </div>
               <form onSubmit={handleSaveItem} className="space-y-4">
                   <div>
                       <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Titel</label>
                       <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 focus:ring-2 focus:ring-primary/50 outline-none text-gray-900 dark:text-white" placeholder="Titel..." required />
                   </div>
                   <div>
                        <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Bild</label>
                        <div className="flex items-center gap-4">
                            {(previewUrl || (editingItem && editingItem.imageId)) ? (
                                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700 group">
                                    <img src={previewUrl || (editingItem?.imageId ? appwriteService.getImageView(editingItem.imageId).href : '')} className="w-full h-full object-cover" alt="Vorschau"/>
                                    <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); if(editingItem) editingItem.imageId = null; }} className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"><X className="w-6 h-6" /></button>
                                </div>
                            ) : (
                                <label className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-400 transition"><ImageIcon className="w-6 h-6 mb-1" /><span className="text-[10px]">Upload</span><input type="file" className="hidden" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) { setSelectedFile(e.target.files[0]); setPreviewUrl(URL.createObjectURL(e.target.files[0])); }}} /></label>
                            )}
                            <div className="text-xs text-gray-400 dark:text-slate-500 flex-1">{selectedFile ? selectedFile.name : 'Foto hochladen.'}</div>
                        </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                           <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Kategorie</label>
                           <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white">
                               {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Monat</label>
                           <input type="month" value={formData.plannedMonth} onChange={e => setFormData({...formData, plannedMonth: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white" />
                       </div>
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Beschreibung</label>
                       <textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white" />
                   </div>
                   <div className="grid grid-cols-3 gap-3">
                       <div>
                           <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Ort</label>
                           <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white" />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Dauer</label>
                           <input type="text" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white" placeholder="2 Std" />
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1">Kosten</label>
                           <select value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value as CostLevel})} className="w-full px-2 py-2 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 outline-none text-sm text-gray-900 dark:text-white">
                               {COST_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>
                       </div>
                   </div>
                   <div className="flex gap-3 pt-4">
                       {!editingItem && <button type="button" onClick={handleAiGenerate} disabled={isAiLoading} className="px-4 py-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50">{isAiLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Sparkles className="w-5 h-5"/>}</button>}
                       <button type="submit" className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:opacity-90 shadow-lg shadow-primary/30">{editingItem ? 'Speichern' : 'Hinzufügen'}</button>
                   </div>
               </form>
           </div>
        </div>
      )}

      {showShuffleModal && pickedIdea && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in" onClick={() => setShowShuffleModal(false)}>
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowShuffleModal(false)} className="absolute top-3 right-3 p-2 bg-white/60 dark:bg-slate-800/60 hover:bg-white dark:hover:bg-slate-800 rounded-full text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors z-20"><X className="w-5 h-5" /></button>
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-primary/20 to-white dark:to-slate-900 -z-10"></div>
                <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 shadow-inner mt-2"><Dices className="w-10 h-10 text-primary" /></div>
                <h2 className="text-sm font-bold text-primary uppercase tracking-wide mb-2">Das Schicksal hat entschieden!</h2>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">{pickedIdea.title}</h3>
                {pickedIdea.description && <p className="text-gray-500 dark:text-slate-400 text-sm mb-8 bg-gray-50 dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-700 italic">"{pickedIdea.description}"</p>}
                <button onClick={() => setShowShuffleModal(false)} className="w-full py-3.5 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/30 hover:opacity-90 transition-transform active:scale-95">Super, machen wir!</button>
                <button onClick={handleShuffle} className="w-full py-3 bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 font-medium rounded-xl border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 mt-2">Nee, nochmal würfeln</button>
            </div>
        </div>
      )}

      {lightboxImageId && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setLightboxImageId(null)}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition" onClick={() => setLightboxImageId(null)}><X className="w-8 h-8" /></button>
            <div className="relative max-w-full max-h-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
                <img src={appwriteService.getImageView(lightboxImageId).href} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" alt="Vollbild" />
                <a href={appwriteService.getImageDownload(lightboxImageId).href} download className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-white text-gray-900 rounded-full font-medium hover:bg-gray-100 transition shadow-lg"><Download className="w-4 h-4" />Herunterladen</a>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;