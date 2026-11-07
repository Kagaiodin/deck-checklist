import "@testing-library/jest-dom";
import { beforeEach, expect } from "vitest";
import { resetForTests } from "../store/collection";

// The Collection store is a module singleton; each test loads it fresh from its own storage.
beforeEach(() => resetForTests());

// A test with no assertion passes silently (#191); fail it instead.
beforeEach(() => expect.hasAssertions());
