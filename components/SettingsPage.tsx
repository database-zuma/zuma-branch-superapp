'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Moon, 
  Sun, 
  Database, 
  Wifi, 
  WifiOff,
  RefreshCw,
  ChevronRight,
  User,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [lastSalesUpdate, setLastSalesUpdate] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Check database connection
  useEffect(() => {
    const checkConnection = async () => {
      setDbStatus('checking');
      // Simulate connection check
      setTimeout(() => {
        setDbStatus('connected');
        setLastSalesUpdate(new Date().toISOString());
      }, 1500);
    };

    checkConnection();
  }, []);

  // Format last update time
  const formatLastUpdate = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut({ redirect: false });
      toast.success('Logged out successfully');
      router.push('/login');
      router.refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      toast.error('Logout failed', { description: message });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const settingsMenu = [
    {
      section: 'Account',
      items: [
        { icon: User, label: 'Profile Information', badge: null },
        { icon: Bell, label: 'Notifications', badge: notifications ? 'On' : 'Off', toggle: true, value: notifications, onChange: setNotifications },
        { icon: Shield, label: 'Privacy & Security', badge: null },
      ]
    },
    {
      section: 'Preferences',
      items: [
        { icon: isDarkMode ? Moon : Sun, label: 'Dark Mode', badge: isDarkMode ? 'On' : 'Off', toggle: true, value: isDarkMode, onChange: setIsDarkMode },
        { icon: RefreshCw, label: 'Auto Sync', badge: autoSync ? 'On' : 'Off', toggle: true, value: autoSync, onChange: setAutoSync },
      ]
    },
    {
      section: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help Center', badge: null },
        { icon: LogOut, label: isLoggingOut ? 'Logging out...' : 'Logout', badge: null, danger: true, onClick: handleLogout },
      ]
    },
  ];

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0D3B2E] to-[#1a5a48] rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <User className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="font-semibold text-lg">Area Supervisor</p>
            <p className="text-sm opacity-80">Jatim Branch</p>
          </div>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-[#0D3B2E]" />
            System Status
          </h3>
        </div>
        
        <div className="p-4 space-y-4">
          {/* Database Connection */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                dbStatus === 'connected' ? "bg-green-100" : 
                dbStatus === 'disconnected' ? "bg-red-100" : "bg-yellow-100"
              )}>
                {dbStatus === 'connected' ? (
                  <Wifi className="w-5 h-5 text-green-600" />
                ) : dbStatus === 'disconnected' ? (
                  <WifiOff className="w-5 h-5 text-red-600" />
                ) : (
                  <RefreshCw className="w-5 h-5 text-yellow-600 animate-spin" />
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">Database</p>
                <p className={cn(
                  "text-xs",
                  dbStatus === 'connected' ? "text-green-600" : 
                  dbStatus === 'disconnected' ? "text-red-600" : "text-yellow-600"
                )}>
                  {dbStatus === 'connected' ? 'Connected' : 
                   dbStatus === 'disconnected' ? 'Disconnected' : 'Checking...'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setDbStatus('checking')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Last Sales Update */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#00D084]/10 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#00D084]" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Last Sales Update</p>
                <p className="text-xs text-gray-500">
                  {lastSalesUpdate ? formatLastUpdate(lastSalesUpdate) : 'Checking...'}
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-400">
              {lastSalesUpdate ? new Date(lastSalesUpdate).toLocaleTimeString() : '--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* Settings Menu */}
      {settingsMenu.map((section) => (
        <div key={section.section} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{section.section}</p>
          </div>
          
          <div className="divide-y divide-gray-100">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    if ('onClick' in item && item.onClick) {
                      item.onClick();
                    } else if ('onChange' in item && item.onChange) {
                      item.onChange(!item.value);
                    }
                  }}
                  disabled={isLoggingOut && item.label === 'Logout'}
                  className={cn(
                    "w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors",
                    'danger' in item && item.danger && "text-red-600",
                    isLoggingOut && item.label === 'Logout' && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("w-5 h-5", 'danger' in item && item.danger ? "text-red-500" : "text-gray-600")} />
                    <span className={cn("font-medium", 'danger' in item && item.danger ? "text-red-600" : "text-gray-900")}>
                      {item.label}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        item.value && item.toggle 
                          ? "bg-[#00D084]/10 text-[#00D084]" 
                          : "bg-gray-100 text-gray-600"
                      )}>
                        {item.badge}
                      </span>
                    )}
                    
                    {'toggle' in item && item.toggle ? (
                      <div className={cn(
                        "w-11 h-6 rounded-full transition-colors relative",
                        item.value ? "bg-[#00D084]" : "bg-gray-300"
                      )}>
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                          item.value ? "translate-x-6" : "translate-x-1"
                        )} />
                      </div>
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* App Version */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">Zuma Super App v1.0.0</p>
        <p className="text-xs text-gray-400 mt-1">© 2026 Zuma Indonesia</p>
      </div>
    </div>
  );
}
