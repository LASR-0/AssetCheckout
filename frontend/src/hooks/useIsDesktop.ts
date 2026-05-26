import { useEffect, useState } from "react";
 
export function useIsDesktop(): boolean {

  const getInitial = () => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  };
 
  const [isDesktop, setIsDesktop] = useState<boolean>(getInitial);
 
  useEffect(() => {
    if (typeof window === "undefined") return;
 
    const query = window.matchMedia("(min-width: 768px)");
 
    function handleChange(event: MediaQueryListEvent) {
      setIsDesktop(event.matches);
    }
 
    setIsDesktop(query.matches);
 
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);
 
  return isDesktop;
}