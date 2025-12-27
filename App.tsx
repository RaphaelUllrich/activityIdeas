import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Check, Sparkles, Heart, X, RotateCcw, Loader2, WifiOff, LogOut, ChevronDown, ChevronUp, MapPin, Clock, Banknote, User, Tag, Dices, Shuffle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DateIdea, Category, CostLevel } from './types';
import { generateDateIdeas } from './services/geminiService';
import { appwriteService } from './services/appwrite';
import LoginScreen from './components/LoginScreen';

// Default Standard Categories
const STANDARD_CATEGORIES: string[] = ['Aktiv', 'Entspannung', 'Essen & Trinken', 'Kultur', 'Reisen', 'Sonstiges'];
const COST_LEVELS: CostLevel[] = ['Kostenlos', '€', '€€', '€€€'];

// Default ideas for seeding
const DEFAULT_IDEAS: DateIdea[] = [
  { id: '1', title: 'Töpfern', category: 'Kultur', description: 'Kreativer Töpferkurs für Zwei.', location: 'Keramikwerkstatt', cost: '€€', duration: '2h', completed: false, createdAt: Date.now(), createdBy: 'System' },
  { id: '2', title: 'Schloss Pillnitz', category: 'Aktiv', description: 'Spaziergang durch den Park und Christmas Garden.', location: 'Pillnitz', cost: '€€', duration: '3h', completed: false, createdAt: Date.now(), createdBy: 'System' },
  { id: '3', title: 'Jumphouse', category: 'Aktiv', description: 'Trampolinhalle Action.', location: 'Dresden', cost: '€€', duration: '1.5h', completed: false, createdAt: Date.now(), createdBy: 'System' },
];

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [ideas, setIdeas] = useState<DateIdea[]>([]);
  const [loading, setLoading] = useState(false);
  
  // New Item Form State
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemCategorySelect, setNewItemCategorySelect] = useState<string>('Sonstiges');
  const [customCategory, setCustomCategory] = useState(''); // For manual input
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemLocation, setNewItemLocation] = useState('');
  const [newItemCost, setNewItemCost] = useState<CostLevel>('€');
  const [newItemDuration, setNewItemDuration] = useState('');

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Random Picker State
  const [pickedIdea, setPickedIdea] = useState<DateIdea | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('active');
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
  
  const [offlineMode, setOfflineMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Persistence helpers
  const saveLocal = (items: DateIdea[]) => localStorage.setItem('datejar_ideas', JSON.stringify(items));
  const getLocal = (): DateIdea[] => {
    const s = localStorage.getItem('datejar_ideas');
    return s ? JSON.parse(s) : DEFAULT_IDEAS;
  };

  // Compute all available categories from current items + standard ones
  const availableCategories = useMemo(() => {
    const cats = new Set(STANDARD_CATEGORIES);
    ideas.forEach(i => cats.add(i.category));
    return Array.from(cats).sort();
  }, [ideas]);

  // Check Auth Status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await appwriteService.getUser();
        setUser(currentUser);
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        setIsAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Fetch Ideas
  useEffect(() => {
    if (user) loadIdeas();
  }, [user]);

  useEffect(() => {
    if (offlineMode && ideas.length > 0) saveLocal(ideas);
  }, [ideas, offlineMode]);

  const handleLogout = async () => {
      await appwriteService.logout();
      setUser(null);
      setIdeas([]);
  };

  const loadIdeas = async () => {
    setLoading(true);
    try {
      const fetchedIdeas = await appwriteService.listIdeas();
      if (fetchedIdeas.length === 0) {
        seedDefaults(); 
      } else {
        setIdeas(fetchedIdeas);
      }
      setOfflineMode(false);
    } catch (error) {
      console.warn("Falling back to local", error);
      setOfflineMode(true);
      setIdeas(getLocal());
    } finally {
      setLoading(false);
    }
  };

  const seedDefaults = async () => {
    try {
      const promises = DEFAULT_IDEAS.map(idea => 
        appwriteService.addIdea(idea)
      );
      const newIdeas = await Promise.all(promises);
      setIdeas(newIdeas.sort((a, b) => b.createdAt - a.createdAt));
    } catch (e) {
      setIdeas(DEFAULT_IDEAS);
      setOfflineMode(true);
    }
  };

  const toggleComplete = async (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    const item = ideas.find(i => i.id === id);
    if (!item) return;

    const oldIdeas = [...ideas];
    const isCompleting = !item.completed;
    
    const newIdeasList = ideas.map(i => i.id === id ? { ...i, completed: isCompleting } : i);
    setIdeas(newIdeasList);
    
    // Close modal if completing from there
    if (pickedIdea && pickedIdea.id === id) {
        setPickedIdea(null);
    }

    if (isCompleting) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f43f5e', '#fda4af', '#fb7185']
      });
    }

    if (offlineMode) {
       saveLocal(newIdeasList);
       return;
    }

    try {
      await appwriteService.updateIdea(id, { completed: isCompleting });
    } catch (error) {
      setOfflineMode(true);
      saveLocal(newIdeasList);
    }
  };

  const deleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Wirklich löschen?')) return;

    const newIdeas = ideas.filter(item => item.id !== id);
    setIdeas(newIdeas);

    if (offlineMode) {
      saveLocal(newIdeas);
      return;
    }

    try {
      await appwriteService.deleteIdea(id);
    } catch (error) {
      setOfflineMode(true);
      saveLocal(newIdeas);
    }
  };

  const resetForm = () => {
      setNewItemTitle('');
      setNewItemCategorySelect('Sonstiges');
      setCustomCategory('');
      setNewItemDesc('');
      setNewItemLocation('');
      setNewItemCost('€');
      setNewItemDuration('');
  };

  const addNewItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemTitle.trim()) return;

    // Determine final category (Standard or Custom)
    const finalCategory = newItemCategorySelect === 'custom' 
        ? (customCategory.trim() || 'Sonstiges') 
        : newItemCategorySelect;

    const tempId = 'temp-' + Date.now();
    const newIdeaPayload: Omit<DateIdea, 'id'> = {
      title: newItemTitle.trim(),
      category: finalCategory,
      description: newItemDesc,
      location: newItemLocation,
      cost: newItemCost,
      duration: newItemDuration,
      createdBy: user?.name || user?.email || 'Anonymous',
      completed: false,
      createdAt: Date.now()
    };

    const updatedIdeas = [{ ...newIdeaPayload, id: tempId }, ...ideas];
    setIdeas(updatedIdeas);
    resetForm();
    setShowAddModal(false);

    if (offlineMode) {
      saveLocal(updatedIdeas);
      return;
    }

    try {
      const savedIdea = await appwriteService.addIdea(newIdeaPayload);
      setIdeas(prev => prev.map(i => i.id === tempId ? savedIdea : i));
    } catch (error) {
      setOfflineMode(true);
      saveLocal(updatedIdeas);
    }
  };

  const pickRandomIdea = () => {
      // Pick from Active ideas that match current filters (optional, but usually better to pick from all active)
      // Let's pick from ALL active ideas to not hide anything
      const activeIdeas = ideas.filter(i => !i.completed);
      
      if (activeIdeas.length === 0) {
          alert("Keine offenen Date-Ideen verfügbar!");
          return;
      }

      const random = activeIdeas[Math.floor(Math.random() * activeIdeas.length)];
      setPickedIdea(random);
      
      // Fun effect
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#FFD700', '#f43f5e', '#3b82f6']
      });
  };

  const handleAiGenerate = async () => {
    setIsAiLoading(true);
    try {
      const activeTitles = ideas.map(i => i.title);
      const suggestions = await generateDateIdeas(activeTitles);
      
      const newItemsMock = suggestions.map(s => ({
          ...s,
          id: 'temp-' + crypto.randomUUID(),
          createdBy: 'Gemini AI',
          completed: false,
          createdAt: Date.now()
      }));

      setIdeas(prev => [...newItemsMock, ...prev]);
      setShowAddModal(false);
      
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.5 },
        shapes: ['star'],
        colors: ['#FFD700', '#f43f5e']
      });

      if (!offlineMode) {
        try {
          const promises = suggestions.map(s => 
            appwriteService.addIdea({
              ...s,
              createdBy: 'Gemini AI',
              completed: false,
              createdAt: Date.now()
            })
          );
          const savedItems = await Promise.all(promises);
          setIdeas(prev => {
             const existing = prev.filter(p => !newItemsMock.find(m => m.id === p.id));
             return [...savedItems, ...existing];
          });
        } catch (e) {
          setOfflineMode(true);
        }
      } else {
        saveLocal([...newItemsMock, ...ideas]);
      }

    } catch (error) {
      alert('Konnte keine Ideen generieren.');
      console.error(error);
    } finally {
      setIsAiLoading(false);
    }
  };

  const filteredIdeas = ideas.filter(item => {
    const statusMatch = statusFilter === 'all' 
      ? true 
      : statusFilter === 'active' ? !item.completed : item.completed;
    
    const catMatch = categoryFilter === 'all' ? true : item.category === categoryFilter;

    return statusMatch && catMatch;
  });

  const activeCount = ideas.filter(i => !i.completed).length;

  const getCategoryColor = (cat: string) => {
      switch(cat) {
          case 'Aktiv': return 'bg-orange-100 text-orange-700';
          case 'Entspannung': return 'bg-blue-100 text-blue-700';
          case 'Essen & Trinken': return 'bg-rose-100 text-rose-700';
          case 'Kultur': return 'bg-purple-100 text-purple-700';
          case 'Reisen': return 'bg-green-100 text-green-700';
          case 'Sonstiges': return 'bg-gray-100 text-gray-700';
          default: return 'bg-indigo-100 text-indigo-700'; // Default color for custom categories
      }
  };

  // -- Render Logic --

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoginSuccess={setUser} />;
  }

  return (
    <div className="min-h-screen bg-rose-50 pb-24 relative overflow-hidden">
      
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md shadow-sm pt-safe-top">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg shadow-md">
              <Heart className="w-6 h-6 text-white fill-current" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800 leading-tight">DateJar</h1>
              <p className="text-xs text-gray-500">
                {loading ? 'Lade...' : `${activeCount} offene Ideen`}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {offlineMode && (
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-500">
                    <WifiOff className="w-5 h-5" />
                </div>
            )}
            <button 
                onClick={pickRandomIdea}
                className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                title="Zufällige Idee"
            >
                <Dices className="w-6 h-6" />
            </button>
            <button 
                onClick={handleLogout}
                className="w-10 h-10 bg-white border border-rose-100 rounded-full flex items-center justify-center text-gray-500 shadow-sm active:scale-90 transition-transform"
            >
                <LogOut className="w-5 h-5" />
            </button>
            <button 
                onClick={() => setShowAddModal(true)}
                className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
            >
                <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Filters Level 1: Status */}
        <div className="flex px-4 pb-2 gap-2 overflow-x-auto no-scrollbar border-b border-gray-100">
          {(['active', 'completed', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === f 
                  ? 'bg-rose-500 text-white' 
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              {f === 'active' ? 'Offen' : f === 'completed' ? 'Erledigt' : 'Alle'}
            </button>
          ))}
        </div>

        {/* Filters Level 2: Categories */}
        <div className="flex px-4 py-2 gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                categoryFilter === 'all' 
                  ? 'bg-gray-800 text-white' 
                  : 'bg-white text-gray-500 border border-gray-200'
              }`}
            >
              Alle Kat.
            </button>
            {availableCategories.map(cat => (
                <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                        categoryFilter === cat ? getCategoryColor(cat) + ' ring-2 ring-offset-1 ring-gray-200' : 'bg-white text-gray-500 border border-gray-200'
                    }`}
                >
                    {cat}
                </button>
            ))}
        </div>
      </header>

      {/* Main List */}
      <main className="max-w-md mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <Heart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Keine Ideen gefunden.</p>
          </div>
        ) : (
          filteredIdeas.map((item) => {
            const isExpanded = expandedId === item.id;
            
            return (
                <div 
                  key={item.id}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className={`group relative bg-white rounded-2xl shadow-sm border border-rose-50 transition-all duration-300 overflow-hidden ${item.completed ? 'opacity-70 bg-gray-50' : 'hover:shadow-md'}`}
                >
                  {/* Card Header */}
                  <div className="p-4 flex items-start gap-3">
                    <button
                      onClick={(e) => toggleComplete(item.id, e)}
                      className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                        item.completed 
                          ? 'bg-green-500 border-green-500' 
                          : 'border-rose-200 hover:border-rose-400'
                      }`}
                    >
                      {item.completed && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                    </button>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                          <h3 className={`text-gray-800 font-medium leading-snug ${item.completed ? 'line-through text-gray-400' : ''}`}>
                            {item.title}
                          </h3>
                          <button 
                            onClick={(e) => deleteItem(item.id, e)}
                            className="text-gray-300 hover:text-red-500 p-1 -mr-2 -mt-1 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${getCategoryColor(item.category)}`}>
                              {item.category}
                          </span>
                          {item.cost && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium">
                                  {item.cost}
                              </span>
                          )}
                      </div>
                    </div>
                    
                    <div className="self-center text-gray-300">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                      <div className="px-4 pb-4 pt-0 text-sm text-gray-600 space-y-3 bg-gray-50/50 border-t border-gray-100">
                          {item.description && (
                              <p className="mt-3 text-gray-700 italic">{item.description}</p>
                          )}
                          
                          <div className="grid grid-cols-2 gap-2 mt-2">
                              {item.location && (
                                  <div className="flex items-center gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{item.location}</span>
                                  </div>
                              )}
                              {item.duration && (
                                  <div className="flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-rose-400" />
                                      <span>{item.duration}</span>
                                  </div>
                              )}
                              {item.createdBy && (
                                  <div className="flex items-center gap-1.5 col-span-2 text-xs text-gray-400 mt-1">
                                      <User className="w-3 h-3" />
                                      <span>Erstellt von {item.createdBy}</span>
                                  </div>
                              )}
                          </div>
                      </div>
                  )}
                </div>
            );
          })
        )}
      </main>

      {/* Random Picker Modal */}
      {pickedIdea && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl relative animate-in zoom-in-95 duration-300">
              <button 
                  onClick={() => setPickedIdea(null)} 
                  className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"
              >
                  <X className="w-5 h-5 text-gray-600" />
              </button>
              
              <div className="text-center mb-6">
                  <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                      <Sparkles className="w-8 h-8 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">Wie wäre es damit?</h2>
                  <p className="text-gray-500 text-sm">Der Zufall hat entschieden!</p>
              </div>

              <div className="bg-rose-50 rounded-2xl p-5 border border-rose-100 mb-6">
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded-md font-semibold mb-2 ${getCategoryColor(pickedIdea.category)}`}>
                      {pickedIdea.category}
                  </span>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">{pickedIdea.title}</h3>
                  {pickedIdea.description && <p className="text-sm text-gray-600 italic mb-3">{pickedIdea.description}</p>}
                  
                  <div className="flex gap-4 text-xs text-gray-500">
                      {pickedIdea.location && <span>📍 {pickedIdea.location}</span>}
                      {pickedIdea.cost && <span>💰 {pickedIdea.cost}</span>}
                  </div>
              </div>

              <div className="flex gap-3">
                  <button 
                      onClick={() => pickRandomIdea()}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 flex justify-center items-center gap-2"
                  >
                      <Shuffle className="w-4 h-4" />
                      <span>Neu würfeln</span>
                  </button>
                  <button 
                      onClick={() => toggleComplete(pickedIdea.id)}
                      className="flex-1 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-rose-600 flex justify-center items-center gap-2 shadow-lg shadow-rose-200"
                  >
                      <Check className="w-4 h-4" />
                      <span>Machen wir!</span>
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Neue Date Idee</h2>
              <button onClick={() => setShowAddModal(false)} className="p-2 bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <form onSubmit={addNewItem} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Titel</label>
                <input
                  type="text"
                  placeholder="Was wollt ihr machen?"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              {/* Category & Cost */}
              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Kategorie</label>
                    <div className="relative">
                        <Tag className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <select
                            value={newItemCategorySelect}
                            onChange={(e) => setNewItemCategorySelect(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none text-sm"
                        >
                            {STANDARD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="custom">+ Neu...</option>
                        </select>
                    </div>
                    {/* Custom Category Input */}
                    {newItemCategorySelect === 'custom' && (
                        <input 
                            type="text"
                            placeholder="Eigene Kategorie..."
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                            autoFocus
                        />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Kosten</label>
                    <div className="relative">
                        <Banknote className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <select
                            value={newItemCost}
                            onChange={(e) => setNewItemCost(e.target.value as CostLevel)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none text-sm"
                        >
                            {COST_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                  </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Beschreibung</label>
                <textarea
                  rows={2}
                  placeholder="Details, Links oder Notizen..."
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Ort</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="z.B. Dresden"
                            value={newItemLocation}
                            onChange={(e) => setNewItemLocation(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Dauer</label>
                    <div className="relative">
                        <Clock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="z.B. 2h"
                            value={newItemDuration}
                            onChange={(e) => setNewItemDuration(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        />
                    </div>
                  </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={isAiLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-50 text-indigo-700 font-semibold flex items-center justify-center gap-2 hover:bg-indigo-100 disabled:opacity-70 border border-indigo-200"
                >
                  {isAiLoading ? (
                    <RotateCcw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>AI Vorschlag</span>
                    </>
                  )}
                </button>
                
                <button
                  type="submit"
                  disabled={!newItemTitle.trim()}
                  className="flex-1 py-3 px-4 rounded-xl bg-primary text-white font-semibold hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-200"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;