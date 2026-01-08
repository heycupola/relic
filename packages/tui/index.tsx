import { initLogger, logger } from "./utils/debugLog";

console.log("DEBUG: Before initLogger");
initLogger();
console.log("DEBUG: After initLogger");
logger.log("App starting - logger initialized");
console.log("DEBUG: After first logger.log");

if (process.env.DEV === "true") {
  try {
    const devtools = await import("react-devtools-core");
    devtools.connectToDevTools({
      host: "localhost",
      port: 8097,
    });
    logger.log("Attempted to connect to React DevTools");
  } catch (err) {
    logger.error("Failed to connect to React DevTools", err);
  }
}

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import { PasswordChangeWarningModal } from "./components/modals";
import { TaskBar } from "./components/shared";
import { useUserKeys } from "./convex/hooks/useUserKeys";
import { useApi } from "./convex/hooks/useApi";
import { AuthProvider, useAuth } from "./convex";
import { AppSessionContext } from "./hooks/useAppSession";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { TaskProvider, useTaskQueue } from "./hooks/useTaskQueue";
import { HomePage, LoginPage, PasswordSetupPage, PasswordUnlockPage, ProjectPage } from "./pages";
import { RouterProvider, useRouter } from "./router";
import { clearPassword, hasPassword, savePassword } from "./utils/passwordStorage";
import { verifyPasswordWithExistingKeys } from "./utils/passwordVerification";

function AppRouter() {
  logger.log("AppRouter rendered");
  const { isAuthenticated, isLoading: isAuthLoading, refreshAuth, logout: authLogout } = useAuth();
  const { route, navigate } = useRouter();
  const { displayName } = useCurrentUser();
  const { runTask, showSuccess, showError } = useTaskQueue();

  logger.log("AppRouter state:", { isAuthenticated, isAuthLoading });

  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ has: boolean; loading: boolean }>({
    has: false,
    loading: true,
  });
  const [showPasswordWarning, setShowPasswordWarning] = useState(false);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [pendingPasswordSetup, setPendingPasswordSetup] = useState<string | null>(null);

  const { hasKeys, encryptedPrivateKey, salt, updatePassword, storeUserKeys, isLoading: isLoadingKeys } = useUserKeys();
  const { api, isLoading: isApiLoading, refreshApi } = useApi();

  // Retry API initialization when authentication state changes
  useEffect(() => {
    if (isAuthenticated && !isAuthLoading && !api && !isApiLoading) {
      logger.debug("Authenticated but API not ready, retrying initialization...");
      refreshApi();
    }
  }, [isAuthenticated, isAuthLoading, api, isApiLoading, refreshApi]);

  useEffect(() => {
    const checkPassword = async () => {
      const has = await hasPassword();
      setPasswordStatus({ has, loading: false });
    };
    checkPassword();
  }, []);

  const handleLogout = useCallback(async () => {
    await authLogout();
    await clearPassword();
    setIsPasswordUnlocked(false);
    navigate({ name: "login" });
  }, [authLogout, navigate]);

  const handlePasswordSetupInternal = useCallback(async (password: string) => {
    if (isLoadingKeys || isApiLoading || !api) {
      logger.debug("Waiting for keys or API to load...");
      return;
    }

    if (hasKeys && encryptedPrivateKey && salt) {
      const isSamePassword = await verifyPasswordWithExistingKeys(
        password,
        encryptedPrivateKey,
        salt,
      );

      if (!isSamePassword) {
        if (!api) {
          logger.error("API not initialized");
          return;
        }

        const [ownedProjects, sharedProjects] = await Promise.all([
          api.listProjects().catch(() => []),
          api.listSharedProjects().catch(() => []),
        ]);

        const hasOwnedProjects = ownedProjects.some((p) => p.status === "owned");
        const hasSharedProjects = sharedProjects.length > 0;

        if (!hasOwnedProjects && !hasSharedProjects) {
          try {
            await runTask("Setting up encryption keys...", async () => {
              const { createUserKeys } = await import("@repo/crypto");
              const newKeys = await createUserKeys(password);
              await updatePassword({
                encryptedPrivateKey: newKeys.encryptedPrivateKey,
                salt: newKeys.salt,
              });
              await savePassword(password);
            });
            setPasswordStatus({ has: true, loading: false });
            setIsPasswordUnlocked(true);
            navigate({ name: "home" });
          } catch (error) {
            logger.error("Failed to setup encryption keys:", error);
          }
          return;
        } else {
          setShowPasswordWarning(true);
          setPendingPassword(password);
          return;
        }
      }
    } else {
      try {
        await runTask("Creating encryption keys...", async () => {
          const { createUserKeys } = await import("@repo/crypto");
          const keys = await createUserKeys(password);
          await storeUserKeys(keys);
          await savePassword(password);
        });
        setPasswordStatus({ has: true, loading: false });
        setIsPasswordUnlocked(true);
        navigate({ name: "home" });
      } catch (error) {
        logger.error("Failed to create encryption keys:", error);
      }
      return;
    }

    await savePassword(password);
    setPasswordStatus({ has: true, loading: false });
    setIsPasswordUnlocked(true);
    navigate({ name: "home" });
  }, [isLoadingKeys, isApiLoading, api, hasKeys, encryptedPrivateKey, salt, updatePassword, storeUserKeys, navigate, runTask]);

  // Auto-complete password setup when keys/API are loaded
  useEffect(() => {
    if (pendingPasswordSetup && !isLoadingKeys && !isApiLoading && api) {
      const password = pendingPasswordSetup;
      setPendingPasswordSetup(null);
      handlePasswordSetupInternal(password);
    }
  }, [pendingPasswordSetup, isLoadingKeys, isApiLoading, api, handlePasswordSetupInternal]);

  const handlePasswordSetup = async (password: string) => {
    if (isLoadingKeys || isApiLoading || !api) {
      logger.debug("Waiting for keys or API to load, storing password for later...");
      setPendingPasswordSetup(password);
      return;
    }
    await handlePasswordSetupInternal(password);
  };

  const handlePasswordWarningConfirm = async () => {
    if (!pendingPassword) {
      setShowPasswordWarning(false);
      return;
    }

    try {
      await runTask("Updating encryption keys...", async () => {
        const { createUserKeys } = await import("@repo/crypto");
        const newKeys = await createUserKeys(pendingPassword);
        await updatePassword({
          encryptedPrivateKey: newKeys.encryptedPrivateKey,
          salt: newKeys.salt,
        });
        await savePassword(pendingPassword);
      });
      setShowPasswordWarning(false);
      setPendingPassword(null);
      setPasswordStatus({ has: true, loading: false });
      setIsPasswordUnlocked(true);
      navigate({ name: "home" });
    } catch (error) {
      logger.error("Failed to update encryption keys:", error);
    }
  };

  const handlePasswordWarningCancel = () => {
    setShowPasswordWarning(false);
    setPendingPassword(null);
  };

  const handlePasswordUnlock = () => {
    setIsPasswordUnlocked(true);
    navigate({ name: "home" });
  };

  const handleLogin = async () => {
    await refreshAuth();
    const has = await hasPassword();
    setPasswordStatus({ has, loading: false });
    if (has) {
      navigate({ name: "password-unlock" });
    } else {
      navigate({ name: "password-setup" });
    }
  };

  if (isAuthLoading || passwordStatus.loading) {
    return null;
  }

  if (!isAuthenticated) {
    logger.log("AppRouter: Not authenticated, showing LoginPage");
    return <LoginPage onLogin={handleLogin} />;
  }

  if (!isPasswordUnlocked) {
    logger.log("AppRouter: Password not unlocked, passwordStatus:", passwordStatus);
    if (passwordStatus.has) {
      return <PasswordUnlockPage onUnlock={handlePasswordUnlock} onLogout={handleLogout} />;
    }
    return (
      <>
        <PasswordSetupPage onComplete={handlePasswordSetup} onLogout={handleLogout} />
        <PasswordChangeWarningModal
          visible={showPasswordWarning}
          onConfirm={handlePasswordWarningConfirm}
          onCancel={handlePasswordWarningCancel}
        />
      </>
    );
  }

  const sessionContext = {
    logout: handleLogout,
    displayName,
  };

  logger.log("AppRouter: Authenticated and unlocked, route:", route.name);
  const renderPage = () => {
    switch (route.name) {
      case "login":
      case "password-setup":
      case "password-unlock":
        navigate({ name: "home" });
        return null;
      case "project":
        return (
          <ProjectPage
            projectId={route.projectId}
            projectName={route.projectName}
            projectStatus={route.projectStatus}
          />
        );
      case "home":
      default:
        return <HomePage />;
    }
  };

  return (
    <AppSessionContext.Provider value={sessionContext}>{renderPage()}</AppSessionContext.Provider>
  );
}

function App() {
  console.log("DEBUG: App component rendered");
  logger.log("App component rendered");
  return (
    <AuthProvider>
      <TaskProvider>
        <RouterProvider>
          <AppRouter />
          <TaskBar />
        </RouterProvider>
      </TaskProvider>
    </AuthProvider>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

logger.log("About to render App component");
createRoot(renderer).render(<App />);
logger.log("App component rendered to root");
