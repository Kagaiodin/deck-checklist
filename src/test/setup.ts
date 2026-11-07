import "@testing-library/jest-dom";
import { beforeEach } from "vitest";
import { resetForTests } from "../store/collection";

// The Collection store is a module singleton; each test loads it fresh from its own storage.
beforeEach(() => resetForTests());
