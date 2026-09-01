import { redirect } from "next/navigation";

export default function Home() {
  // Redirigir siempre al login como página de entrada
  redirect("/login");
}
