import { useEffect } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSafeNavigate } from "./useSafeNavigate";

const navigateMock = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

function Harness({ onReady, fallbackNavigate }) {
  const safeNavigate = useSafeNavigate({ fallbackNavigate });

  useEffect(() => {
    onReady(safeNavigate);
  }, [onReady, safeNavigate]);

  return null;
}

describe("useSafeNavigate", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.useFakeTimers();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("navigates and skips fallback when destination is reached", () => {
    const onReady = vi.fn();
    const fallbackNavigate = vi.fn();
    render(<Harness onReady={onReady} fallbackNavigate={fallbackNavigate} />);

    const safeNavigate = onReady.mock.calls[0][0];
    safeNavigate("/dashboard");
    window.history.pushState({}, "", "/dashboard");

    vi.runAllTimers();

    expect(navigateMock).toHaveBeenCalledWith("/dashboard");
    expect(fallbackNavigate).not.toHaveBeenCalled();
  });

  test("falls back to hard navigation when destination is not reached", () => {
    const onReady = vi.fn();
    const fallbackNavigate = vi.fn();
    render(<Harness onReady={onReady} fallbackNavigate={fallbackNavigate} />);

    const safeNavigate = onReady.mock.calls[0][0];
    safeNavigate("/scheduler/abc");

    vi.runAllTimers();

    expect(navigateMock).toHaveBeenCalledWith("/scheduler/abc");
    expect(fallbackNavigate).toHaveBeenCalledWith("/scheduler/abc");
  });

  test("supports pathname+search comparison mode", () => {
    const onReady = vi.fn();
    const fallbackNavigate = vi.fn();
    render(<Harness onReady={onReady} fallbackNavigate={fallbackNavigate} />);

    const safeNavigate = onReady.mock.calls[0][0];
    safeNavigate("/dashboard?tab=open", { compareMode: "pathname+search" });
    window.history.pushState({}, "", "/dashboard?tab=open");

    vi.runAllTimers();

    expect(navigateMock).toHaveBeenCalledWith("/dashboard?tab=open");
    expect(fallbackNavigate).not.toHaveBeenCalled();
  });
});
