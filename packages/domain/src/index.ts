/**
 * @twofront/domain — the single source of truth (ADR-0006).
 * The web app and Playwright E2E import inferred types from here.
 * There are NO parallel type definitions anywhere else.
 */
export * from "./ids";
export * from "./config";
export * from "./fibonacci";
export * from "./task";
export * from "./email";
export * from "./sms";
export * from "./api";
export * from "./snapshot";
export * from "./events";
