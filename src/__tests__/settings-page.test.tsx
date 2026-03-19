import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

declare const __APP_VERSION__: string;

const mockSignOut = vi.fn();
vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut: mockSignOut }),
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue("test-token") }),
  ClerkProvider: ({ children }: any) => children,
}));

const mockApiFetch = vi.fn();
vi.mock("../lib/api", () => ({
  useApiFetch: () => mockApiFetch,
}));

const mockUserData = {
  user: {
    id: "u1",
    email: "test@example.com",
    name: "Test User",
    imageUrl: "https://example.com/avatar.jpg",
    plan: { id: "plan1", name: "Pro", slug: "pro" },
    isAdmin: false,
    defaultDurationTier: 5,
  },
};

const mockUsageData = {
  data: {
    briefingsUsed: 5,
    briefingsLimit: 100,
    subscriptionsUsed: 3,
    subscriptionsLimit: 10,
  },
};

vi.mock("../lib/use-fetch", () => ({
  useFetch: (endpoint: string) => {
    if (endpoint === "/me") {
      return { data: mockUserData, loading: false, error: null, refetch: vi.fn() };
    }
    if (endpoint === "/me/usage") {
      return { data: mockUsageData, loading: false, error: null, refetch: vi.fn() };
    }
    return { data: null, loading: false, error: null, refetch: vi.fn() };
  },
}));

// Mock PlanComparison since it's complex and fetches its own data
vi.mock("../components/plan-comparison", () => ({
  PlanComparison: () => <div data-testid="plan-comparison">Plans</div>,
}));

vi.mock("../contexts/theme-context", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

vi.mock("../contexts/plan-context", () => ({
  usePlan: () => ({ maxDurationMinutes: 15, subscriptions: { limit: 10, remaining: 7 } }),
}));

import { Settings } from "../pages/Settings";

beforeAll(() => {
  (globalThis as any).__APP_VERSION__ = "0.8.17";
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  );
}

describe("Settings Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Account section", () => {
    it("renders user avatar, name, and email", () => {
      renderSettings();

      expect(screen.getByText("Test User")).toBeInTheDocument();
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("renders avatar image when imageUrl provided", () => {
      renderSettings();

      const avatar = screen.getByRole("img", { name: "Test User" });
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute("src", "https://example.com/avatar.jpg");
    });
  });

  describe("Usage meters", () => {
    it("renders usage meters with correct values", () => {
      renderSettings();

      expect(screen.getByText("5 / 100")).toBeInTheDocument();
      expect(screen.getByText("3 / 10")).toBeInTheDocument();
    });

    it("renders Briefings and Subscriptions labels", () => {
      renderSettings();

      expect(screen.getByText("Briefings")).toBeInTheDocument();
      expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    });
  });

  describe("About section", () => {
    it("shows app version", () => {
      renderSettings();

      expect(screen.getByText("0.8.17")).toBeInTheDocument();
    });

    it("shows Terms and Privacy links", () => {
      renderSettings();

      expect(screen.getByText("Terms of Service")).toBeInTheDocument();
      expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    });
  });

  describe("Data & Privacy", () => {
    it("renders export data button", () => {
      renderSettings();

      expect(screen.getByText("Export My Data")).toBeInTheDocument();
    });

    it("renders delete account button", () => {
      renderSettings();

      expect(screen.getByText("Delete Account")).toBeInTheDocument();
    });
  });

  describe("Sign Out", () => {
    it("renders sign out button", () => {
      renderSettings();

      expect(screen.getByText("Sign Out")).toBeInTheDocument();
    });

    it("calls signOut when clicked", () => {
      renderSettings();

      fireEvent.click(screen.getByText("Sign Out"));

      expect(mockSignOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    });
  });

  describe("Delete Account flow", () => {
    it("opens delete confirmation dialog", async () => {
      renderSettings();

      fireEvent.click(screen.getByText("Delete Account"));

      // Dialog opens in a portal; use getByRole to find content reliably
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Verify dialog content is present (search within dialog)
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Type DELETE to confirm");
    });

    it("disables delete button until DELETE is typed", async () => {
      const user = userEvent.setup();
      renderSettings();

      fireEvent.click(screen.getByText("Delete Account"));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // The "Delete My Account" button should be disabled initially
      const deleteBtn = screen.getByRole("button", { name: "Delete My Account" });
      expect(deleteBtn).toBeDisabled();

      // Type "DELETE" into the confirmation input
      const input = screen.getByPlaceholderText("DELETE");
      await user.type(input, "DELETE");

      // Now the button should be enabled
      expect(deleteBtn).not.toBeDisabled();
    });
  });
});
