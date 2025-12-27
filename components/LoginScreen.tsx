import React, { useState } from 'react';
import { Heart, Loader2, Lock, Mail, AlertCircle } from 'lucide-react';
import { appwriteService } from '../services/appwrite';

interface LoginScreenProps {
  onLoginSuccess: (user: any) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      await appwriteService.login(email, password);
      const user = await appwriteService.getUser();
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError('Anmeldung fehlgeschlagen. Bitte überprüfe deine Daten.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rose-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-rose-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-pink-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-80 h-80 bg-rose-300 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000"></div>

      <div className="bg-white/80 backdrop-blur-lg w-full max-w-sm rounded-3xl shadow-2xl p-8 border border-white/50 relative z-10">
        <div className="text-center mb-8">
          <div className="bg-primary w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3 transform hover:rotate-6 transition-transform">
            <Heart className="w-8 h-8 text-white fill-current" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Willkommen zurück</h1>
          <p className="text-gray-500 text-sm mt-1">Melde dich bei deiner DateJar an</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2 mb-6">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Email</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                placeholder="name@beispiel.de"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Passwort</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-primary transition-colors" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-primary hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 mt-4"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Anmelden'}
          </button>
        </form>

        <div className="mt-8 text-center">
            <p className="text-xs text-gray-400">
                Kein Account? Bitte wende dich an den Administrator.
            </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;