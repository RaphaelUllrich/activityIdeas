import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Check, Sparkles, Heart, X, Loader2, WifiOff, LogOut, Menu, Calendar, List as ListIcon, GripVertical, Pencil, Dices, Coins, Clock, MapPin, Banknote } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { format, addMonths, startOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';

import { DateIdea, CostLevel } from './types';
import { generateDateIdeas } from './services/geminiService';
import { appwriteService, CollectionMeta } from './services/appwrite';
import LoginScreen from './components/LoginScreen';

// Constants
const STANDARD_CATEGORIES: string[] = ['Aktiv', 'Entspannung', 'Essen & Trinken', 'Kultur', 'Reisen', 'Sonstiges'];
const COST_LEVELS: CostLevel[] = ['Kostenlos', '€', '€€', '€€€'];
const DEFAULT_COLLECTIONS = ['Aktivitäten', 'Gerichte', 'Ideen'];

const App: React.FC = () => {
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Data State
  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  
  // View State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'planner'>('list');
  
  // COLLECTION STATE (New: Object Array from DB)
  const [collections, setCollections] = useState<CollectionMeta[]>([]);
  const [activeCollection, setActiveCollection] = useState<string>('Aktivitäten');
  
  // UI Helpers
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // SHUFFLE STATE
  const [pickedIdea, setPickedIdea] = useState<DateIdea | null>(null);
  const [showShuffleModal, setShowShuffleModal] = useState(false);

  // Edit/Add Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DateIdea | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
      title: '',
      category: 'Sonstiges' as string,
      customCategory: '',
      description: '',
      location: '',
      cost: '€' as CostLevel,
      duration: '',
      plannedMonth: '' // YYYY-MM
  });

  // FILTERS STATE
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  const [costFilter, setCostFilter] = useState<CostLevel | 'all'>('all');
  const [durationFilter, setDurationFilter] = useState<string | 'all'>('all');

  // Persistence helpers (Fallback only)
  const saveLocal = (items: DateIdea[]) => localStorage.setItem('datejar_ideas', JSON.stringify(items));
  const getLocal = (): DateIdea[] => {
    const s = localStorage.getItem('datejar_ideas');
    return s ? JSON.parse(s) : [];
  };

  // Auth & Initial Load
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

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load Collections
      let cols = await appwriteService.listCollections();
      
      // If empty (first run), create defaults
      if (cols.length === 0) {
          for (const name of DEFAULT_COLLECTIONS) {
              await appwriteService.createCollection(name);
          }
          cols = await appwriteService.listCollections();
      }
      setCollections(cols);

      // Set active
      if (cols.length > 0) {
           // If current active not in list, fallback to first
           if (!cols.find(c => c.name === activeCollection)) {
               setActiveCollection(cols[0].name);
           }
      }

      // 2. Load Ideas
      const fetchedIdeas = await appwriteService.listIdeas();
      setIdeas(fetchedIdeas);
      setOfflineMode(false);
    } catch (error) {
      console.warn("Offline", error);
      setOfflineMode(true);
      setIdeas(getLocal());
      // Fallback collections for offline
      setCollections(DEFAULT_COLLECTIONS.map((n, i) => ({ $id: `local-${i}`, name: n })));
    } finally {
      setLoading(false);
      setIsAuthLoading(false);
    }
  };

  // --- Actions ---

  const handleLogout = async () => {
      await appwriteService.logout();
      setUser(null);
      setIdeas([]);
      window.location.reload(); // Hard reload to clear states
  };

  // --- Collection Management ---
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
          // Cleanup ideas in frontend
          setIdeas(prev => prev.filter(i => i.type !== name));
          
          if (activeCollection === name && newCols.length > 0) {
              setActiveCollection(newCols[0].name);
          }
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

  // --- Modal / Idea Management ---

  const openModal = (item?: DateIdea) => {
      if (item) {
          setEditingItem(item);
          setFormData({
              title: item.title,
              category: STANDARD_CATEGORIES.includes(item.category) ? item.category : 'custom',
              customCategory: STANDARD_CATEGORIES.includes(item.category) ? '' : item.category,
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
              customCategory: '',
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

    const finalCategory = formData.category === 'custom' 
        ? (formData.customCategory.trim() || 'Sonstiges') 
        : formData.category;

    const commonPayload = {
      title: formData.title.trim(),
      category: finalCategory,
      description: formData.description,
      location: formData.location,
      cost: formData.cost,
      duration: formData.duration,
      type: activeCollection,
      plannedMonth: formData.plannedMonth || undefined,
    };

    if (editingItem) {
        // UPDATE
        const updatedItem = { ...editingItem, ...commonPayload };
        setIdeas(prev => prev.map(i => i.id === editingItem.id ? updatedItem : i));
        setShowModal(false);

        if(!offlineMode) {
            try {
                await appwriteService.updateIdea(editingItem.id, commonPayload);
            } catch(e) { console.error(e); setOfflineMode(true); }
        } else {
            saveLocal(ideas.map(i => i.id === editingItem.id ? updatedItem : i));
        }

    } else {
        // CREATE
        const tempId = 'temp-' + Date.now();
        const maxOrder = Math.max(...ideas.map(i => i.order || 0), 0);
        
        const newItem = {
            ...commonPayload,
            id: tempId,
            createdBy: user?.name || user?.email || 'Anonymous',
            completed: false,
            createdAt: Date.now(),
            order: maxOrder + 1,
            type: activeCollection
        };

        const newIdeas = [newItem, ...ideas];
        setIdeas(newIdeas);
        setShowModal(false);

        if (!offlineMode) {
            try {
                const saved = await appwriteService.addIdea(newItem);
                setIdeas(prev => prev.map(i => i.id === tempId ? saved : i));
            } catch (e) { console.error(e); setOfflineMode(true); saveLocal(newIdeas); }
        } else {
            saveLocal(newIdeas);
        }
    }
  };

  const deleteItem = async (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    if (!window.confirm('Wirklich löschen?')) return;
    const newIdeas = ideas.filter(item => item.id !== id);
    setIdeas(newIdeas);
    if (!offlineMode) {
      try { await appwriteService.deleteIdea(id); } catch (e) { setOfflineMode(true); }
    }
    saveLocal(newIdeas);
  };

  const toggleComplete = async (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    const item = ideas.find(i => i.id === id);
    if (!item) return;

    const isCompleting = !item.completed;
    const newIdeas = ideas.map(i => i.id === id ? { ...i, completed: isCompleting } : i);
    setIdeas(newIdeas);
    
    if (isCompleting) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#f43f5e', '#fda4af'] });

    if (!offlineMode) {
        try { await appwriteService.updateIdea(id, { completed: isCompleting }); } catch(e) { setOfflineMode(true); }
    }
    saveLocal(newIdeas);
  };

  // --- Shuffle Logic ---
  const handleShuffle = () => {
    const pool = currentCollectionIdeas.filter(i => !i.completed);
    
    if (pool.length === 0) {
        alert("Keine offenen Ideen in dieser Sammlung vorhanden!");
        return;
    }

    const randomItem = pool[Math.floor(Math.random() * pool.length)];
    setPickedIdea(randomItem);
    setShowShuffleModal(true);

    confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.7 },
        colors: ['#FFD700', '#f43f5e', '#4F46E5']
    });
  };

  // --- Drag & Drop Reordering ---

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
          if (newIndex !== -1) {
              return { ...idea, order: newIndex };
          }
          return idea;
      });

      setIdeas(updatedIdeas);

      if (!offlineMode) {
          try {
             await appwriteService.updateIdea(movedItem.id, { order: destIndex });
          } catch(e) { console.error(e); }
      }
  };

  // --- Planner Logic ---

  const getMonths = () => {
      const today = startOfMonth(new Date());
      return Array.from({ length: 12 }, (_, i) => addMonths(today, i));
  };

  // --- AI ---
  const handleAiGenerate = async () => {
    setIsAiLoading(true);
    try {
      const titles = ideas.filter(i => i.type === activeCollection).map(i => i.title);
      const suggestions = await generateDateIdeas(titles);
       const newItems = suggestions.map((s, idx) => ({
          ...s,
          id: 'temp-' + crypto.randomUUID(),
          createdBy: 'Gemini AI',
          completed: false,
          createdAt: Date.now() + idx,
          type: activeCollection,
          order: -1
      }));
      setIdeas(prev => [...newItems, ...prev]);
      setShowModal(false);
      
      if(!offlineMode) {
         suggestions.forEach(s => appwriteService.addIdea({...s, createdBy: 'Gemini AI', completed: false, createdAt: Date.now(), type: activeCollection, order: 0}));
      }
    } catch (e) { alert('Fehler bei AI Generierung'); } finally { setIsAiLoading(false); }
  };

  // --- Derived Data ---

  const currentCollectionIdeas = ideas.filter(i => (i.type || 'Aktivitäten') === activeCollection);

  const availableCategories = useMemo(() => {
    const cats = new Set(STANDARD_CATEGORIES);
    currentCollectionIdeas.forEach(i => cats.add(i.category));
    return Array.from(cats).sort();
  }, [currentCollectionIdeas]);

  const availableDurations = useMemo(() => {
    const durs = new Set<string>();
    currentCollectionIdeas.forEach(i => { if(i.duration) durs.add(i.duration) });
    return Array.from(durs).sort();
  }, [currentCollectionIdeas]);

  const filteredIdeas = currentCollectionIdeas.filter(item => {
    if (viewMode === 'planner') return true; 
    
    const statusMatch = statusFilter === 'all' ? true : statusFilter === 'active' ? !item.completed : item.completed;
    const catMatch = categoryFilter === 'all' ? true : item.category === categoryFilter;
    const costMatch = costFilter === 'all' ? true : item.cost === costFilter;
    const durMatch = durationFilter === 'all' ? true : item.duration === durationFilter;

    return statusMatch && catMatch && costMatch && durMatch;
  }).sort((a, b) => (a.order || 0) - (b.order || 0));

  const getCategoryColor = (cat: string) => {
    if(['Aktiv', 'Kultur'].includes(cat)) return 'bg-orange-100 text-orange-700';
    if(['Entspannung'].includes(cat)) return 'bg-blue-100 text-blue-700';
    if(['Essen & Trinken'].includes(cat)) return 'bg-rose-100 text-rose-700';
    return 'bg-gray-100 text-gray-700';
  };

  // --- Render ---

  if (isAuthLoading) return <div className="h-screen flex items-center justify-center bg-rose-50"><Loader2 className="animate-spin text-primary" /></div>;
  if (!user) return <LoginScreen onLoginSuccess={setUser} />;

  return (
    <div className="min-h-screen bg-rose-50 relative flex overflow-hidden">
      
      {/* Sidebar Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />}
      
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800">Sammlungen</h2>
                <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-full hover:bg-gray-100"><X className="w-6 h-6" /></button>
            </div>
            
            <nav className="flex-1 space-y-2 overflow-y-auto">
                {collections.map(col => (
                    <div 
                        key={col.$id} 
                        className={`w-full group px-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-between cursor-pointer ${activeCollection === col.name ? 'bg-rose-100 text-rose-700' : 'text-gray-600 hover:bg-gray-50'}`}
                        onClick={() => { setActiveCollection(col.name); setSidebarOpen(false); }}
                    >
                        <span>{col.name}</span>
                        
                        <div className="flex items-center gap-1">
                            {activeCollection === col.name && <Check className="w-4 h-4 mr-2" />}
                            <button onClick={(e) => handleRenameCollection(col.$id, col.name, e)} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <Pencil className="w-3 h-3" />
                            </button>
                            {collections.length > 1 && (
                                <button onClick={(e) => handleDeleteCollection(col.$id, col.name, e)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </nav>

            <button onClick={handleAddCollection} className="mt-4 flex items-center gap-2 text-gray-500 hover:text-primary px-2 font-medium">
                <Plus className="w-5 h-5" />
                <span>Neue Sammlung</span>
            </button>

            <div className="border-t border-gray-100 mt-6 pt-4">
                 <button onClick={handleLogout} className="flex items-center gap-3 text-gray-400 hover:text-red-500 w-full px-2">
                    <LogOut className="w-5 h-5" />
                    <span>Abmelden</span>
                 </button>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 h-screen overflow-hidden flex flex-col">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm z-10 shrink-0">
            <div className="max-w-2xl mx-auto px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full">
                            <Menu className="w-6 h-6 text-gray-600" />
                        </button>
                        <div>
                             <h1 className="text-xl font-bold text-gray-800">{activeCollection}</h1>
                             <p className="text-xs text-gray-500">{filteredIdeas.length} Einträge</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         <button onClick={handleShuffle} className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shadow-sm active:scale-90 transition-transform hover:bg-indigo-200" title="Zufällige Idee">
                             <Dices className="w-6 h-6" />
                         </button>
                         <button onClick={() => setViewMode(viewMode === 'list' ? 'planner' : 'list')} className={`p-2 rounded-full ${viewMode === 'planner' ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
                             {viewMode === 'list' ? <Calendar className="w-5 h-5" /> : <ListIcon className="w-5 h-5" />}
                         </button>
                         <button onClick={() => openModal()} className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform">
                             <Plus className="w-6 h-6" />
                         </button>
                    </div>
                </div>

                {/* Filter Bar */}
                {viewMode === 'list' && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        <div className="flex p-1 bg-gray-100 rounded-lg shrink-0">
                            {(['active', 'completed', 'all'] as const).map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${statusFilter === s ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                    {s === 'active' ? 'Offen' : s === 'completed' ? 'Erledigt' : 'Alle'}
                                </button>
                            ))}
                        </div>
                        <div className="w-px bg-gray-200 my-1 shrink-0"></div>

                        <select 
                            value={categoryFilter} 
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer outline-none ${categoryFilter !== 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                        >
                            <option value="all">Alle Kategorien</option>
                            {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>

                        <select 
                            value={costFilter} 
                            onChange={(e) => setCostFilter(e.target.value as any)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer outline-none ${costFilter !== 'all' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                        >
                            <option value="all">Preis: Alle</option>
                            {COST_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {availableDurations.length > 0 && (
                            <select 
                                value={durationFilter} 
                                onChange={(e) => setDurationFilter(e.target.value)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border appearance-none cursor-pointer outline-none ${durationFilter !== 'all' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                            >
                                <option value="all">Dauer: Alle</option>
                                {availableDurations.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        )}
                    </div>
                )}
            </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-rose-50/50 p-4">
            
            {/* VIEW: LIST */}
            {viewMode === 'list' && (
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="list">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="max-w-md mx-auto space-y-3 pb-20">
                                {filteredIdeas.length === 0 && (
                                    <div className="text-center py-12 opacity-40">
                                        <Heart className="w-16 h-16 mx-auto mb-2 text-gray-300" />
                                        <p>Nichts gefunden für diese Filter.</p>
                                    </div>
                                )}
                                {filteredIdeas.map((item, index) => (
                                    <Draggable 
                                        // @ts-expect-error
                                        key={item.id} 
                                        draggableId={item.id} 
                                        index={index}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={`bg-white rounded-2xl shadow-sm border border-rose-50 overflow-hidden ${snapshot.isDragging ? 'shadow-xl ring-2 ring-primary rotate-2' : ''} ${item.completed ? 'opacity-60 bg-gray-50' : ''}`}
                                            >
                                                <div className="p-3 flex items-start gap-3">
                                                    <div {...provided.dragHandleProps} className="mt-1 text-gray-300 cursor-grab active:cursor-grabbing">
                                                        <GripVertical className="w-5 h-5" />
                                                    </div>
                                                    
                                                    <button onClick={(e) => toggleComplete(item.id, e)} className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${item.completed ? 'bg-green-500 border-green-500' : 'border-rose-200'}`}>
                                                        {item.completed && <Check className="w-3.5 h-3.5 text-white" />}
                                                    </button>

                                                    <div className="flex-1 min-w-0" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                                                        <div className="flex justify-between items-start">
                                                            <h3 className={`font-medium text-gray-800 truncate ${item.completed ? 'line-through text-gray-400' : ''}`}>{item.title}</h3>
                                                            <button onClick={(e) => { e.stopPropagation(); openModal(item); }} className="text-gray-400 hover:text-primary p-1">
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        <div className="flex gap-2 mt-1">
                                                            <span className={`text-[10px] px-1.5 rounded font-semibold ${getCategoryColor(item.category)}`}>{item.category}</span>
                                                            {item.cost && item.cost !== 'Kostenlos' && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 rounded flex items-center gap-0.5"><Coins className="w-3 h-3"/> {item.cost}</span>}
                                                            {item.duration && <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 rounded flex items-center gap-0.5"><Clock className="w-3 h-3"/> {item.duration}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Details */}
                                                {expandedId === item.id && (
                                                    <div className="px-4 pb-4 pt-0 text-sm text-gray-600 space-y-2 border-t border-gray-100 bg-gray-50/50 mt-2">
                                                        {item.description && <p className="mt-2 italic">{item.description}</p>}
                                                        <div className="flex gap-4 text-xs mt-2">
                                                            {item.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.location}</span>}
                                                            {item.plannedMonth && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{item.plannedMonth}</span>}
                                                        </div>
                                                        <div className="flex justify-end pt-2">
                                                            <button onClick={(e) => deleteItem(item.id, e)} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1"><Trash2 className="w-3 h-3"/> Löschen</button>
                                                        </div>
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

            {/* VIEW: PLANNER */}
            {viewMode === 'planner' && (
                <div className="flex gap-4 overflow-x-auto pb-6 h-full items-start no-scrollbar">
                    {/* Unplanned Column */}
                    <div className="w-72 shrink-0 flex flex-col h-full bg-gray-100/50 rounded-2xl p-2">
                        <h3 className="font-bold text-gray-500 mb-3 px-2 sticky top-0">Ungeplant</h3>
                        <div className="space-y-2 overflow-y-auto flex-1">
                            {currentCollectionIdeas.filter(i => !i.plannedMonth && !i.completed).map(item => (
                                <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-200">
                                    <div className="font-medium text-sm text-gray-800">{item.title}</div>
                                    <div className="flex justify-between items-center mt-2">
                                        <span className={`text-[10px] px-1.5 rounded ${getCategoryColor(item.category)}`}>{item.category}</span>
                                        <button onClick={() => openModal(item)}><Pencil className="w-3 h-3 text-gray-400"/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Month Columns */}
                    {getMonths().map(date => {
                        const monthStr = format(date, 'yyyy-MM');
                        const displayStr = format(date, 'MMMM yyyy', { locale: de });
                        const monthItems = currentCollectionIdeas.filter(i => i.plannedMonth === monthStr);

                        return (
                            <div key={monthStr} className="w-72 shrink-0 flex flex-col h-full bg-white rounded-2xl border border-rose-100 p-2 shadow-sm">
                                <h3 className="font-bold text-rose-600 mb-3 px-2 sticky top-0 flex justify-between">
                                    {displayStr}
                                    <span className="text-xs bg-rose-100 px-2 py-0.5 rounded-full">{monthItems.length}</span>
                                </h3>
                                <div className="space-y-2 overflow-y-auto flex-1">
                                    {monthItems.map(item => (
                                        <div key={item.id} className={`bg-rose-50 p-3 rounded-xl border border-rose-100 ${item.completed ? 'opacity-50' : ''}`}>
                                            <div className="font-medium text-sm text-gray-800">{item.title}</div>
                                            <div className="flex justify-between items-center mt-2">
                                                 <span className={`text-[10px] px-1.5 rounded ${getCategoryColor(item.category)}`}>{item.category}</span>
                                                 <button onClick={() => openModal(item)}><Pencil className="w-3 h-3 text-gray-400"/></button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                                        + Planen
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
      </div>

      {/* Edit/Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800">{editingItem ? 'Bearbeiten' : 'Neu erstellen'}</h2>
                  <button onClick={() => setShowModal(false)} className="p-2 bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-600"/></button>
               </div>
               
               <form onSubmit={handleSaveItem} className="space-y-4">
                   <div>
                       <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Titel</label>
                       <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:ring-2 focus:ring-primary/50 outline-none" placeholder="Titel..." required />
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                       <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Kategorie</label>
                            <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm">
                                {STANDARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                <option value="custom">+ Neu...</option>
                            </select>
                            {formData.category === 'custom' && (
                                <input type="text" value={formData.customCategory} onChange={e => setFormData({...formData, customCategory: e.target.value})} className="mt-2 w-full px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-sm outline-none" placeholder="Name..." autoFocus />
                            )}
                       </div>
                       <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Monat Planen</label>
                            <input type="month" value={formData.plannedMonth} onChange={e => setFormData({...formData, plannedMonth: e.target.value})} className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm" />
                       </div>
                   </div>

                   <div>
                       <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Beschreibung</label>
                       <textarea rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm" placeholder="Details..." />
                   </div>

                   <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ort</label>
                            <input type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Dauer</label>
                            <input type="text" value={formData.duration} onChange={e => setFormData({...formData, duration: e.target.value})} className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm" placeholder="z.B. 2 Std" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Kosten</label>
                            <select value={formData.cost} onChange={e => setFormData({...formData, cost: e.target.value as CostLevel})} className="w-full px-2 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none text-sm">
                                {COST_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                   </div>

                   <div className="flex gap-3 pt-4">
                       {!editingItem && (
                           <button type="button" onClick={handleAiGenerate} disabled={isAiLoading} className="px-4 py-3 rounded-xl bg-indigo-50 text-indigo-600 font-semibold border border-indigo-200 hover:bg-indigo-100">
                               {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Sparkles className="w-5 h-5"/>}
                           </button>
                       )}
                       <button type="submit" className="flex-1 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-rose-600 shadow-lg shadow-rose-200">
                           {editingItem ? 'Speichern' : 'Hinzufügen'}
                       </button>
                   </div>
               </form>
           </div>
        </div>
      )}

      {/* SHUFFLE RESULT MODAL */}
      {showShuffleModal && pickedIdea && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-in fade-in" onClick={() => setShowShuffleModal(false)}>
            <div 
                className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl text-center relative overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <button 
                    onClick={() => setShowShuffleModal(false)} 
                    className="absolute top-3 right-3 p-2 bg-white/60 hover:bg-white rounded-full text-gray-400 hover:text-gray-600 transition-colors z-20"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-indigo-100 to-white -z-10"></div>
                
                <div className="mx-auto w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6 shadow-inner mt-2">
                    <Dices className="w-10 h-10 text-indigo-600" />
                </div>
                
                <h2 className="text-sm font-bold text-indigo-500 uppercase tracking-wide mb-2">Das Schicksal hat entschieden!</h2>
                <h3 className="text-2xl font-bold text-gray-800 mb-4">{pickedIdea.title}</h3>
                
                <div className="flex flex-wrap justify-center gap-2 mb-6">
                     <span className={`text-xs px-2 py-1 rounded font-semibold ${getCategoryColor(pickedIdea.category)}`}>{pickedIdea.category}</span>
                     {pickedIdea.cost && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{pickedIdea.cost}</span>}
                     {pickedIdea.duration && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{pickedIdea.duration}</span>}
                </div>
                
                {pickedIdea.description && (
                    <p className="text-gray-500 text-sm mb-8 bg-gray-50 p-3 rounded-xl border border-gray-100 italic">"{pickedIdea.description}"</p>
                )}

                <div className="space-y-3">
                    <button onClick={() => setShowShuffleModal(false)} className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-transform active:scale-95">
                        Super, machen wir!
                    </button>
                    <button onClick={handleShuffle} className="w-full py-3 bg-white text-gray-500 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                        Nee, nochmal würfeln
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;