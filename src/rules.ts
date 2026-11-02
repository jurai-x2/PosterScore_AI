// Shared rule contracts are implemented on the server so browser code cannot
// influence facts or score caps. This public module exposes the same contracts
// to fixtures and tooling without duplicating the registry.
export * from "../server/rules";
