import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../app";
import type { StudyDto } from "../api/schemas";
import { studiesKeys } from "../queries/studies-queries";
import { useSessionStore } from "../stores/session-store";
import { deferred } from "../test/deferred";
import { makeStudy } from "../test/handlers";
import { renderWithProviders } from "../test/render";
import { server } from "../test/server";

const inReviewA = (n: number, version = 1) =>
  makeStudy(n, { status: "InReview", ownerId: "reviewer-a", version });

function serveStudies(studies: StudyDto[]) {
  server.use(
    http.get("/api/studies/:id", ({ params }) => {
      const s = studies.find((x) => x.id === params["id"]);
      return s ? HttpResponse.json(s) : HttpResponse.json({}, { status: 404 });
    }),
  );
}

function select(id: string) {
  act(() => useSessionStore.getState().selectStudy(id));
}

describe("StudyPanel", () => {
  it("drafts are scoped to study id: A→B→A restores A, B stays empty", async () => {
    serveStudies([inReviewA(1), inReviewA(2)]);
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.type(await screen.findByLabelText("Review note"), "note A");
    select("study-002");
    await screen.findByRole("heading", { name: /study-002 · / });
    expect(await screen.findByLabelText("Review note")).toHaveValue("");
    select("study-001");
    await screen.findByRole("heading", { name: /study-001 · / });
    expect(await screen.findByLabelText("Review note")).toHaveValue("note A");
  });

  it("stale completion (412) keeps the draft, shows current version, disables Complete until Refresh and continue", async () => {
    const current = inReviewA(1, 3);
    let getBody: StudyDto = inReviewA(1, 1);
    server.use(
      http.get("/api/studies/:id", () => HttpResponse.json(getBody)),
      http.post("/api/studies/:id/complete", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", message: "stale", current },
          { status: 412 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.type(await screen.findByLabelText("Review note"), "note A");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText(/now version 3/)).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("note A");
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
    getBody = current;
    await user.click(
      screen.getByRole("button", { name: "Refresh and continue" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Review note")).toHaveValue("note A");
  });

  it("network error on complete keeps the draft and shows a retry message", async () => {
    server.use(
      http.get("/api/studies/:id", () => HttpResponse.json(inReviewA(1))),
      http.post("/api/studies/:id/complete", () => HttpResponse.error()),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.type(await screen.findByLabelText("Review note"), "note A");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(
      await screen.findByText("Could not reach the server. Your note is kept."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Review note")).toHaveValue("note A");
    expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled();
  });

  it("switching reviewer to the non-owner disables Complete and relabels the owner", async () => {
    serveStudies([inReviewA(1)]);
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.type(await screen.findByLabelText("Review note"), "note A");
    expect(screen.getByText("Owner: you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeEnabled();
    act(() => useSessionStore.getState().setReviewer("reviewer-b"));
    expect(screen.getByText("Owner: reviewer-a")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Complete" }),
    ).not.toBeInTheDocument();
    expect(useSessionStore.getState().drafts["study-001"]).toBe("note A");
  });

  it("Claim is disabled while the claim request is pending (deferred) and a second click sends no second request", async () => {
    const gate = deferred<StudyDto>();
    let claims = 0;
    server.use(
      http.get("/api/studies/:id", () => HttpResponse.json(makeStudy(1))),
      http.post("/api/studies/:id/claim", async () => {
        claims += 1;
        return HttpResponse.json(await gate.promise);
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    const claim = await screen.findByRole("button", { name: "Claim" });
    await waitFor(() => expect(claim).toBeEnabled());
    await user.click(claim);
    await waitFor(() => expect(claim).toBeDisabled());
    await user.click(claim);
    expect(claims).toBe(1);
    gate.resolve(inReviewA(1, 1));
    expect(await screen.findByText("Study claimed.")).toBeInTheDocument();
    expect(claims).toBe(1);
  });

  it("a delayed GET study response resolving after a successful claim does not revert the panel", async () => {
    const d1 = deferred<StudyDto>();
    let gets = 0;
    server.use(
      http.get("/api/studies/:id", async () => {
        gets += 1;
        if (gets === 1) return HttpResponse.json(makeStudy(1, { version: 1 }));
        return HttpResponse.json(await d1.promise);
      }),
      http.post("/api/studies/:id/claim", () =>
        HttpResponse.json(inReviewA(1, 2)),
      ),
    );
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<App />);
    select("study-001");
    const claim = await screen.findByRole("button", { name: "Claim" });
    await waitFor(() => expect(claim).toBeEnabled());

    // Start a second (held) detail fetch, then claim while it is in flight.
    void queryClient.invalidateQueries({
      queryKey: studiesKeys.detail("study-001"),
    });
    await waitFor(() => expect(gets).toBe(2));
    const seen: string[] = [];
    const observer = new MutationObserver(() => {
      for (const h of screen.queryAllByRole("heading"))
        seen.push(h.textContent ?? "");
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    await user.click(claim);
    await screen.findByRole("heading", { name: /version 2/ });
    expect(
      screen.getByRole("heading", { name: /InReview · version 2/ }),
    ).toBeInTheDocument();

    d1.resolve(makeStudy(1, { version: 1 }));
    await waitFor(() =>
      expect(
        queryClient.isFetching({ queryKey: studiesKeys.detail("study-001") }),
      ).toBe(0),
    );
    expect(
      screen.getByRole("heading", { name: /version 2/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /InReview · version 2/ }),
    ).toBeInTheDocument();
    observer.disconnect();
    expect(seen.filter((t) => /Unassigned|version 1/.test(t))).toEqual([]);
  });

  it("a 412 on claim also disables Claim until Refresh and continue", async () => {
    const current = inReviewA(1, 1);
    let getBody: StudyDto = makeStudy(1);
    server.use(
      http.get("/api/studies/:id", () => HttpResponse.json(getBody)),
      http.post("/api/studies/:id/claim", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", message: "stale", current },
          { status: 412 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.click(await screen.findByRole("button", { name: "Claim" }));
    expect(await screen.findByText(/now version 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeDisabled();
    getBody = makeStudy(1, { version: 1 });
    await user.click(
      screen.getByRole("button", { name: "Refresh and continue" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Claim" })).toBeEnabled(),
    );
  });

  it('Close viewer clears the panel and shows "Select a study to view it."', async () => {
    serveStudies([makeStudy(1)]);
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.click(
      await screen.findByRole("button", { name: "Close viewer" }),
    );
    expect(screen.getByText("Select a study to view it.")).toBeInTheDocument();
    expect(useSessionStore.getState().selectedStudyId).toBeNull();
  });
});

describe("StudyPanel 412 recovery across selection", () => {
  it("keeps the stale notice and Refresh and continue after switching A→B→A", async () => {
    const current = inReviewA(1, 3);
    let getBody: StudyDto = makeStudy(1);
    server.use(
      http.get("/api/studies/:id", ({ params }) =>
        HttpResponse.json(
          params["id"] === "study-001" ? getBody : makeStudy(2),
        ),
      ),
      http.post("/api/studies/:id/claim", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", message: "stale", current },
          { status: 412 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.click(await screen.findByRole("button", { name: "Claim" }));
    expect(await screen.findByText(/now version 3/)).toBeInTheDocument();
    select("study-002");
    await screen.findByRole("heading", { name: /study-002 · / });
    select("study-001");
    expect(await screen.findByText(/now version 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeDisabled();
    getBody = current;
    await user.click(
      screen.getByRole("button", { name: "Refresh and continue" }),
    );
    await waitFor(() =>
      expect(screen.queryByText(/now version/)).not.toBeInTheDocument(),
    );
    expect(useSessionStore.getState().blocked["study-001"]).toBeUndefined();
  });

  it("Complete stays disabled with the notice after A→B→A following a 412", async () => {
    const current = inReviewA(1, 3);
    server.use(
      http.get("/api/studies/:id", ({ params }) =>
        HttpResponse.json(
          params["id"] === "study-001" ? inReviewA(1, 1) : makeStudy(2),
        ),
      ),
      http.post("/api/studies/:id/complete", () =>
        HttpResponse.json(
          { code: "STALE_VERSION", message: "stale", current },
          { status: 412 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<App />);
    select("study-001");
    await user.type(await screen.findByLabelText("Review note"), "note A");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await screen.findByText(/now version 3/);
    select("study-002");
    await screen.findByRole("heading", { name: /study-002 · / });
    select("study-001");
    expect(await screen.findByText(/now version 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeDisabled();
    expect(screen.getByLabelText("Review note")).toHaveValue("note A");
    expect(
      screen.getByRole("button", { name: "Refresh and continue" }),
    ).toBeInTheDocument();
  });
});
