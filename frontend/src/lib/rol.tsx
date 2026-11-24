"use client";

import { createContext, useContext } from "react";

export type Rol = "ADMIN" | "OPERADOR";

/** Rol de quien tiene la sesión abierta (lo entrega el panel). El servidor es quien manda: esto solo oculta lo que daría 403. */
export const RolContext = createContext<Rol>("OPERADOR");

export const useEsAdmin = () => useContext(RolContext) === "ADMIN";
