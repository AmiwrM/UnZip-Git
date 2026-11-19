/* ==========================================================================
   UnzipGit
   Unzip a .zip archive straight into a GitHub repository — 100% client-side.

   Flow
   1. Read the archive from the device (or from the repository via the API).
   2. Open it with JSZip.
   3. Commit all files in one atomic commit (blobs → tree → commit → ref).
      If that is blocked, fall back to one Contents API PUT per file.
   ========================================================================== */

(() => {
  "use strict";

  const API = "https://api.github.com";
  const MAX_FILES = 1500;
  const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024; // GitHub's per-file limit
  const CONCURRENCY = 5;
  const LS_THEME = "unzipgit:theme";
  const LS_LANG = "unzipgit:lang";

  // ------------------------------------------------------------------------
  // i18n
  // ------------------------------------------------------------------------

  const STRINGS = {
    en: {
      title: "UnzipGit — unzip archives into a GitHub repository",
      tagline: "unzip archives into a GitHub repository",
      username: "username",
      usernameHint: "optional if included in repository",
      repository: "repository",
      repoHint: "repo or repo/folder",
      token: "token",
      tokenHint: "get token",
      tokenScope: "with “repo” scope",
      archivePath: "archive in repo",
      archivePathHint: "or pick a file",
      selectArchive: "select archive",
      advanced: "Advanced",
      branch: "branch",
      branchHint: "default branch",
      commitMessage: "commit message",
      commitMessageHint: "optional",
      submit: "Unzip into GitHub",
      working: "Working…",
      clientSide: "100% client-side",
      apiDocs: "GitHub API",
      readme: "readme",
      readmeTitle: "readme",
      themeToggle: "Toggle dark mode",
      langToggle: "Switch language",
      showToken: "Show token",
      hideToken: "Hide token",
      close: "Close",

      statusChecking: "Checking repository…",
      statusDownloading: "Downloading archive…",
      statusReading: "Opening archive…",
      statusUploading: "Uploading files…",
      statusCommitting: "Committing changes…",
      statusWriting: "Writing files one by one…",
      statusDone: "Done",
      statusError: "Something went wrong",
      filesProgress: "{done} of {total} files",
      successInfo: "{count} files unzipped into {repo}.",
      openRepo: "Open repository",
      defaultCommit: "unzipgit: unzip archive",

      errFields: "Fill in the required fields.",
      errRepoFormat: "Enter a repository as “repo” or “owner/repo”.",
      errOwner: "That repository owner looks invalid.",
      errRepoName: "That repository name looks invalid.",
      errFolder: "The target folder path is invalid.",
      errArchivePath: "The archive path is invalid.",
      errNothing: "Pick an archive from your device or enter its path in the repository.",
      errToken: "The token is invalid or expired. Create a new one with the “repo” scope.",
      errForbidden: "This token cannot write to the repository. Check its permissions (repo scope / Contents: write).",
      errNoPush: "You do not have push access to this repository.",
      errRate: "GitHub's API rate limit was reached. Wait a few minutes and try again.",
      errNotFound: "Not found on GitHub. Check the repository name and token access.",
      errRepoNotFound: "Repository not found. Check the owner/name and that your token can see it.",
      errBranchNotFound: "That branch does not exist in the repository.",
      errArchiveNotFound: "No archive found at that path in the repository.",
      errArchiveNotFile: "That path is not a file.",
      errConflict: "GitHub reported a conflict. Try again in a moment.",
      errValidation: "GitHub rejected the request: {message}",
      errServer: "GitHub had a server error. Try again in a moment.",
      errApi: "GitHub error {status}: {message}",
      errNetwork: "Network error. Check your connection and try again.",
      errZip: "Could not open this file. Is it a valid .zip archive?",
      errZipEntry: "Could not extract “{path}”: {message}",
      errNoFiles: "The archive contains no files.",
      errTooMany: "The archive has {count} files, but the limit is {max}. Split it into smaller archives.",
      errTooLarge: "The archive is larger than {max} MB, which GitHub does not accept through the API.",
      errReadRemote: "Could not read the archive from the repository.",
      errUpload: "Upload failed: {message}",
      errNoLib: "The ZIP library failed to load. Reload the page.",
      errUnexpected: "Unexpected error: {message}",
    },

    fa: {
      title: "UnzipGit — باز کردن آرشیوها در مخزن گیت‌هاب",
      tagline: "آرشیوها را در مخزن گیت‌هاب از حالت فشرده خارج کن",
      username: "نام کاربری",
      usernameHint: "اگر در نام مخزن باشد، لازم نیست",
      repository: "مخزن",
      repoHint: "مخزن یا مخزن/پوشه",
      token: "توکن",
      tokenHint: "دریافت توکن",
      tokenScope: "با دسترسی «repo»",
      archivePath: "آرشیو داخل مخزن",
      archivePathHint: "یا یک فایل انتخاب کنید",
      selectArchive: "انتخاب آرشیو",
      advanced: "پیشرفته",
      branch: "شاخه",
      branchHint: "شاخهٔ پیش‌فرض",
      commitMessage: "پیام کامیت",
      commitMessageHint: "اختیاری",
      submit: "از حالت فشرده خارج کن",
      working: "در حال انجام…",
      clientSide: "کاملاً سمت مرورگر",
      apiDocs: "API گیت‌هاب",
      readme: "راهنما",
      readmeTitle: "راهنما",
      themeToggle: "حالت تاریک/روشن",
      langToggle: "تغییر زبان",
      showToken: "نمایش توکن",
      hideToken: "پنهان کردن توکن",
      close: "بستن",

      statusChecking: "بررسی مخزن…",
      statusDownloading: "دانلود آرشیو…",
      statusReading: "باز کردن آرشیو…",
      statusUploading: "آپلود فایل‌ها…",
      statusCommitting: "ثبت تغییرات…",
      statusWriting: "نوشتن فایل‌ها یکی‌یکی…",
      statusDone: "انجام شد",
      statusError: "مشکلی پیش آمد",
      filesProgress: "{done} از {total} فایل",
      successInfo: "{count} فایل در {repo} از حالت فشرده خارج شد.",
      openRepo: "باز کردن مخزن",
      defaultCommit: "unzipgit: باز کردن آرشیو",

      errFields: "فیلدهای لازم را پر کنید.",
      errRepoFormat: "مخزن را به شکل «مخزن» یا «مالک/مخزن» وارد کنید.",
      errOwner: "نام مالک مخزن معتبر نیست.",
      errRepoName: "نام مخزن معتبر نیست.",
      errFolder: "مسیر پوشهٔ مقصد معتبر نیست.",
      errArchivePath: "مسیر آرشیو معتبر نیست.",
      errNothing: "یک آرشیو از دستگاه انتخاب کنید یا مسیر آن را در مخزن بنویسید.",
      errToken: "توکن نامعتبر یا منقضی شده است. یک توکن تازه با دسترسی «repo» بسازید.",
      errForbidden: "این توکن اجازهٔ نوشتن در مخزن را ندارد. دسترسی‌ها (repo یا Contents: write) را بررسی کنید.",
      errNoPush: "شما اجازهٔ ارسال (push) به این مخزن را ندارید.",
      errRate: "محدودیت نرخ API گیت‌هاب پر شده است. چند دقیقه صبر کنید و دوباره تلاش کنید.",
      errNotFound: "در گیت‌هاب پیدا نشد. نام مخزن و دسترسی توکن را بررسی کنید.",
      errRepoNotFound: "مخزن پیدا نشد. مالک/نام و دسترسی توکن را بررسی کنید.",
      errBranchNotFound: "این شاخه در مخزن وجود ندارد.",
      errArchiveNotFound: "آرشیوی در این مسیر داخل مخزن پیدا نشد.",
      errArchiveNotFile: "این مسیر یک فایل نیست.",
      errConflict: "گیت‌هاب تضاد (conflict) گزارش کرد. لحظه‌ای بعد دوباره تلاش کنید.",
      errValidation: "گیت‌هاب درخواست را رد کرد: {message}",
      errServer: "خطای سرور گیت‌هاب. لحظه‌ای بعد دوباره تلاش کنید.",
      errApi: "خطای گیت‌هاب {status}: {message}",
      errNetwork: "خطای شبکه. اتصال را بررسی کنید و دوباره تلاش کنید.",
      errZip: "این فایل باز نشد. مطمئنید یک آرشیو ZIP معتبر است؟",
      errZipEntry: "استخراج «{path}» ممکن نشد: {message}",
      errNoFiles: "آرشیو هیچ فایلی ندارد.",
      errTooMany: "آرشیو {count} فایل دارد، اما سقف {max} فایل است. آن را به آرشیوهای کوچک‌تر بشکنید.",
      errTooLarge: "آرشیو از {max} مگابایت بزرگ‌تر است و گیت‌هاب آن را از طریق API نمی‌پذیرد.",
      errReadRemote: "خواندن آرشیو از مخزن ممکن نشد.",
      errUpload: "آپلود ناموفق بود: {message}",
      errNoLib: "کتابخانهٔ ZIP بارگذاری نشد. صفحه را دوباره باز کنید.",
      errUnexpected: "خطای غیرمنتظره: {message}",
    },
  };

  let lang = "en";

  function t(key, vars = {}) {
    const dict = STRINGS[lang] || STRINGS.en;
    const template = dict[key] != null ? dict[key] : STRINGS.en[key] != null ? STRINGS.en[key] : key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
      vars[name] != null ? String(vars[name]) : match,
    );
  }

  // ------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const form = $("#unzipForm");
  const usernameInput = $("#username");
  const repositoryInput = $("#repository");
  const tokenInput = $("#token");
  const archivePathInput = $("#archivePath");
  const archiveFileInput = $("#archiveFile");
  const branchInput = $("#branch");
  const messageInput = $("#commitMessage");

  const pickZone = $("#pickZone");
  const pickName = $("#pickName");
  const pickSize = $("#pickSize");
  const revealBtn = $("#revealBtn");

  const submitBtn = $("#submitBtn");
  const submitLabel = $("#submitLabel");

  const themeBtn = $("#themeBtn");
  const langBtn = $("#langBtn");

  const toastEl = $("#toast");
  const toastTitle = $("#toastTitle");
  const toastInfo = $("#toastInfo");
  const toastLink = $("#toastLink");
  const toastProgress = $("#toastProgress");
  const toastBar = $("#toastBar");
  const toastClose = $("#toastClose");

  const readmeDialog = $("#readmeDialog");
  const readmeBtn = $("#readmeBtn");
  const closeReadme = $("#closeReadme");

  let busy = false;
  let toastTimer = null;

  // ------------------------------------------------------------------------
  // Errors
  // ------------------------------------------------------------------------

  class HttpError extends Error {
    constructor(status, message, rateLimited) {
      super(message || `HTTP ${status}`);
      this.name = "HttpError";
      this.status = status;
      this.rateLimited = Boolean(rateLimited);
    }
  }

  class AppError extends Error {
    constructor(key, vars) {
      super(key);
      this.name = "AppError";
      this.key = key;
      this.vars = vars;
    }
  }

  function toUserMessage(error) {
    if (error instanceof AppError) return t(error.key, error.vars);

    if (error instanceof HttpError) {
      if (error.status === 401) return t("errToken");
      if (error.rateLimited) return t("errRate");
      if (error.status === 403) return t("errForbidden");
      if (error.status === 404) return t("errNotFound");
      if (error.status === 409) return t("errConflict");
      if (error.status === 422) return t("errValidation", { message: error.message });
      if (error.status >= 500) return t("errServer");
      return t("errApi", { status: error.status, message: error.message });
    }

    return t("errUnexpected", { message: (error && error.message) || String(error) });
  }

  // ------------------------------------------------------------------------
  // GitHub API
  // ------------------------------------------------------------------------

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function api(path, { method = "GET", body, token } = {}) {
    const url = /^https?:\/\//.test(path) ? path : API + path;
    let attempt = 0;

    for (;;) {
      let response;

      try {
        response = await fetch(url, {
          method,
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": "2022-11-28",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
      } catch (error) {
        if (attempt < 2) {
          attempt += 1;
          await sleep(600 * attempt);
          continue;
        }
        throw new AppError("errNetwork");
      }

      if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        const limited = remaining === "0" || retryAfter > 0;

        if (limited && attempt < 2) {
          attempt += 1;
          await sleep(retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 2500 * attempt);
          continue;
        }
      }

      if (!response.ok) {
        let data = null;
        try {
          data = await response.json();
        } catch (error) {
          /* no JSON body */
        }

        const message = (data && data.message) || response.statusText || `HTTP ${response.status}`;
        const rateLimited =
          /rate limit|abuse/i.test(message) || response.headers.get("x-ratelimit-remaining") === "0";

        throw new HttpError(response.status, message, rateLimited);
      }

      if (response.status === 204) return null;

      try {
        return await response.json();
      } catch (error) {
        return null;
      }
    }
  }

  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
  const encodeRef = (ref) => ref.split("/").map(encodeURIComponent).join("/");

  // ------------------------------------------------------------------------
  // Archive helpers
  // ------------------------------------------------------------------------

  /** Normalise a path from a zip file and reject traversal. Returns null if unsafe. */
  function safePath(raw) {
    const cleaned = String(raw)
      .replace(/\\/g, "/")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, "");

    const parts = [];

    for (const segment of cleaned.split("/")) {
      if (!segment || segment === ".") continue;
      if (segment === "..") return null;
      parts.push(segment);
    }

    return parts.join("/");
  }

  function fileMode(entry) {
    if (typeof entry.unixPermissions === "number" && (entry.unixPermissions & 0o111) !== 0) {
      return "100755";
    }
    return "100644";
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }

    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  /** owner/repo + optional folder inside the repo. */
  function resolveTarget(usernameRaw, repoRaw) {
    const username = usernameRaw.trim();
    const cleanedRepo = String(repoRaw)
      .trim()
      .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
      .replace(/\.git\/?$/i, "");

    const parts = cleanedRepo
      .replace(/\\/g, "/")
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) throw new AppError("errRepoFormat");

    let owner;
    let repo;
    let rest;

    if (username) {
      // "owner/repo" is accepted as well when the first segment is the username.
      if (parts.length > 1 && parts[0].toLowerCase() === username.toLowerCase()) {
        owner = parts[0];
        repo = parts[1];
        rest = parts.slice(2);
      } else {
        owner = username;
        repo = parts[0];
        rest = parts.slice(1);
      }
    } else {
      if (parts.length < 2) throw new AppError("errRepoFormat");
      owner = parts[0];
      repo = parts[1];
      rest = parts.slice(2);
    }

    if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new AppError("errOwner");
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) throw new AppError("errRepoName");

    const folderRaw = rest.join("/");
    const folder = safePath(folderRaw);

    if (folderRaw && folder === null) throw new AppError("errFolder");

    return { owner, repo, folder };
  }

  async function readRemoteArchive(owner, repo, branch, path, token) {
    let meta;

    try {
      meta = await api(
        `/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
        { token },
      );
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) throw new AppError("errArchiveNotFound");
      throw error;
    }

    if (!meta || Array.isArray(meta) || meta.type !== "file") throw new AppError("errArchiveNotFile");

    // The Contents API omits inline content for files over ~1 MB; use the blob API instead.
    if (meta.encoding === "base64" && meta.content) {
      return { data: meta.content.replace(/\s/g, ""), base64: true };
    }

    try {
      const blob = await api(`/repos/${owner}/${repo}/git/blobs/${meta.sha}`, { token });
      if (!blob || !blob.content) throw new Error("empty blob");
      return { data: blob.content.replace(/\s/g, ""), base64: true };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new AppError("errReadRemote");
    }
  }

  // ------------------------------------------------------------------------
  // Upload
  // ------------------------------------------------------------------------

  async function pool(items, limit, worker) {
    let cursor = 0;
    let failure = null;

    const run = async () => {
      while (!failure && cursor < items.length) {
        const index = cursor;
        cursor += 1;

        try {
          await worker(items[index], index);
        } catch (error) {
          failure = error;
          throw error;
        }
      }
    };

    const size = Math.min(limit, items.length);

    try {
      await Promise.all(Array.from({ length: size }, run));
    } catch (error) {
      throw failure || error;
    }
  }

  async function entryBase64(entry) {
    try {
      return await entry.async("base64");
    } catch (error) {
      throw new AppError("errZipEntry", {
        path: entry.name,
        message: (error && error.message) || "unknown",
      });
    }
  }

  async function uploadAtomic({
    owner,
    repo,
    branch,
    defaultBranch,
    entries,
    message,
    token,
    onProgress,
  }) {
    const branchRef = encodeRef(branch);
    let head = null;
    let baseTree = null;

    try {
      head = await api(`/repos/${owner}/${repo}/git/ref/heads/${branchRef}`, { token });
    } catch (error) {
      // A brand-new repository has no refs yet; a missing named branch is an error.
      const missingRef = error instanceof HttpError && (error.status === 404 || error.status === 409);
      if (!missingRef) throw error;
      if (branch !== defaultBranch) throw new AppError("errBranchNotFound");
      head = null;
    }

    if (head && head.object && head.object.sha) {
      const baseCommit = await api(`/repos/${owner}/${repo}/git/commits/${head.object.sha}`, {
        token,
      });
      baseTree = baseCommit && baseCommit.tree ? baseCommit.tree.sha : null;
    }

    const blobs = new Array(entries.length);
    let done = 0;

    await pool(entries, CONCURRENCY, async (item, index) => {
      const content = await entryBase64(item.entry);
      const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        token,
        body: { content, encoding: "base64" },
      });

      blobs[index] = {
        path: item.path,
        mode: item.mode,
        type: "blob",
        sha: blob.sha,
      };

      done += 1;
      onProgress(done, entries.length);
    });

    const treeBody = { tree: blobs };
    if (baseTree) treeBody.base_tree = baseTree;

    const tree = await api(`/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      token,
      body: treeBody,
    });

    const commitBody = {
      message,
      tree: tree.sha,
      parents: head ? [head.object.sha] : [],
    };

    const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      token,
      body: commitBody,
    });

    if (head) {
      await api(`/repos/${owner}/${repo}/git/refs/heads/${branchRef}`, {
        method: "PATCH",
        token,
        body: { sha: commit.sha, force: false },
      });
    } else {
      await api(`/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        token,
        body: { ref: `refs/heads/${branch}`, sha: commit.sha },
      });
    }

    return commit.sha;
  }

  async function uploadOneByOne({ owner, repo, branch, entries, message, token, onProgress }) {
    let done = 0;

    for (const item of entries) {
      const content = await entryBase64(item.entry);
      const path = `/repos/${owner}/${repo}/contents/${encodePath(item.path)}`;
      const body = { message, content, branch };

      try {
        await api(path, { method: "PUT", token, body });
      } catch (error) {
        // The file already exists: fetch its blob sha and retry the update once.
        if (error instanceof HttpError && error.status === 422) {
          const existing = await api(`${path}?ref=${encodeURIComponent(branch)}`, { token });
          if (!existing || !existing.sha) throw error;

          await api(path, { method: "PUT", token, body: { ...body, sha: existing.sha } });
        } else {
          throw error;
        }
      }

      done += 1;
      onProgress(done, entries.length);
    }
  }

  function canFallBack(error) {
    return (
      error instanceof HttpError &&
      !error.rateLimited &&
      [403, 404, 409, 422].includes(error.status)
    );
  }

  // ------------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------------

  function setBusy(state) {
    busy = state;
    submitBtn.disabled = state;
    submitBtn.classList.toggle("is-busy", state);
    form.setAttribute("aria-busy", state ? "true" : "false");
    submitLabel.textContent = state ? t("working") : t("submit");

    if (state) window.addEventListener("beforeunload", guardUnload);
    else window.removeEventListener("beforeunload", guardUnload);
  }

  function guardUnload(event) {
    event.preventDefault();
    event.returnValue = "";
    return "";
  }

  function showToast({
    kind = "info",
    title,
    info = "",
    busy: sticky = false,
    progress = null,
    link = null,
  }) {
    clearTimeout(toastTimer);

    toastEl.dataset.kind = kind;
    toastEl.classList.add("is-visible");
    toastEl.setAttribute("aria-hidden", "false");

    toastTitle.textContent = title || "";
    toastInfo.textContent = info || "";

    if (link) {
      toastLink.href = link.href;
      toastLink.textContent = link.label;
      toastLink.hidden = false;
    } else {
      toastLink.hidden = true;
      toastLink.removeAttribute("href");
    }

    if (progress == null) {
      toastProgress.hidden = true;
    } else {
      toastProgress.hidden = false;
      toastBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }

    toastClose.hidden = sticky;

    if (!sticky) {
      const delay = kind === "error" ? 14000 : kind === "success" ? 10000 : 7000;
      toastTimer = setTimeout(hideToast, delay);
    }
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove("is-visible");
    toastEl.setAttribute("aria-hidden", "true");
  }

  function markInvalid(ids) {
    for (const id of ids) {
      const input = document.getElementById(id);
      if (!input) continue;

      const field = input.closest(".field");
      if (field) field.classList.add("is-invalid");

      if (id === "archivePath" || id === "archiveFile") pickZone.classList.add("is-invalid");
    }
  }

  function clearInvalid(target) {
    const input = typeof target === "string" ? document.getElementById(target) : target;
    if (!input) return;

    const field = input.closest(".field");
    if (field) field.classList.remove("is-invalid");
    pickZone.classList.remove("is-invalid");
  }

  function applyLang(next) {
    lang = STRINGS[next] ? next : "en";

    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "fa" ? "rtl" : "ltr";
    document.title = t("title");

    for (const element of $$("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }

    if (busy) submitLabel.textContent = t("working");

    for (const element of $$("[data-i18n-aria]")) {
      element.setAttribute("aria-label", t(element.dataset.i18nAria));
    }

    for (const element of $$("[data-i18n-placeholder]")) {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    }

    langBtn.textContent = lang === "fa" ? "EN" : "فارسی";
    langBtn.setAttribute("aria-label", `${langBtn.textContent} — ${t("langToggle")}`);
    themeBtn.setAttribute("aria-label", t("themeToggle"));
    revealBtn.setAttribute("aria-label", t(tokenInput.type === "password" ? "showToken" : "hideToken"));
    toastClose.setAttribute("aria-label", t("close"));
    closeReadme.setAttribute("aria-label", t("close"));

    try {
      localStorage.setItem(LS_LANG, lang);
    } catch (error) {
      /* storage may be disabled */
    }
  }

  // ------------------------------------------------------------------------
  // Main flow
  // ------------------------------------------------------------------------

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy) return;

    const username = usernameInput.value.trim();
    const repositoryRaw = repositoryInput.value.trim();
    const token = tokenInput.value.trim();
    const archivePathRaw = archivePathInput.value.trim();
    const file = archiveFileInput.files && archiveFileInput.files[0];

    const missing = [];
    if (!repositoryRaw) missing.push("repository");
    if (!token) missing.push("token");
    if (!archivePathRaw && !file) {
      missing.push("archivePath");
      missing.push("archiveFile");
      pickZone.classList.add("is-invalid");
    }

    if (missing.length) {
      markInvalid(missing);
      const first = form.querySelector(".is-invalid .field__input");
      if (first) first.focus();
      showToast({ kind: "error", title: t("statusError"), info: t("errFields") });
      return;
    }

    if (typeof JSZip === "undefined") {
      showToast({ kind: "error", title: t("statusError"), info: t("errNoLib") });
      return;
    }

    let zip;
    let target;
    let branch;
    let archivePath;

    try {
      target = resolveTarget(username, repositoryRaw);

      archivePath = archivePathRaw ? safePath(archivePathRaw) : "";
      if (archivePathRaw && archivePath === null) throw new AppError("errArchivePath");

      setBusy(true);
      showToast({ kind: "info", title: t("statusChecking"), busy: true });

      const repoInfo = await api(`/repos/${target.owner}/${target.repo}`, { token }).catch((error) => {
        if (error instanceof HttpError && error.status === 404) throw new AppError("errRepoNotFound");
        throw error;
      });

      if (repoInfo.permissions && repoInfo.permissions.push === false) {
        throw new AppError("errNoPush");
      }

      const defaultBranch = repoInfo.default_branch || "main";
      branch = branchInput.value.trim() || defaultBranch;

      let archive = null;

      if (file) {
        if (file.size > MAX_ARCHIVE_BYTES) {
          throw new AppError("errTooLarge", { max: 100 });
        }
        archive = { data: await file.arrayBuffer(), base64: false };
      } else {
        showToast({ kind: "info", title: t("statusDownloading"), info: archivePath, busy: true });
        archive = await readRemoteArchive(target.owner, target.repo, branch, archivePath, token);
      }

      showToast({ kind: "info", title: t("statusReading"), busy: true });

      try {
        zip = await JSZip.loadAsync(archive.data, { base64: archive.base64 });
      } catch (error) {
        throw new AppError("errZip");
      }

      // Build the final entry list: folder prefix + sanitised zip path, deduplicated.
      const byPath = new Map();

      for (const [rawPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;

        const clean = safePath(rawPath);
        if (!clean) continue;

        const path = target.folder ? `${target.folder}/${clean}` : clean;
        byPath.set(path, { path, entry, mode: fileMode(entry) });
      }

      const entries = Array.from(byPath.values());

      if (!entries.length) throw new AppError("errNoFiles");
      if (entries.length > MAX_FILES) {
        throw new AppError("errTooMany", { count: entries.length, max: MAX_FILES });
      }

      const message =
        messageInput.value.trim() ||
        t("defaultCommit");

      const onProgress = (done, total) => {
        showToast({
          kind: "info",
          title: t("statusUploading"),
          info: t("filesProgress", { done, total }),
          progress: (done / total) * 100,
          busy: true,
        });
      };

      onProgress(0, entries.length);

      const uploadContext = {
        owner: target.owner,
        repo: target.repo,
        branch,
        defaultBranch,
        entries,
        message,
        token,
        onProgress,
      };

      try {
        await uploadAtomic(uploadContext);
      } catch (error) {
        if (!canFallBack(error)) throw error;

        showToast({
          kind: "warn",
          title: t("statusWriting"),
          info: t("filesProgress", { done: 0, total: entries.length }),
          progress: 0,
          busy: true,
        });

        await uploadOneByOne(uploadContext);
      }

      showToast({ kind: "info", title: t("statusCommitting"), busy: true, progress: 100 });

      const branchUrl = encodeRef(branch);
      const folderUrl = target.folder ? `/${encodeRef(target.folder)}` : "";

      showToast({
        kind: "success",
        title: t("statusDone"),
        info: t("successInfo", {
          count: entries.length,
          repo: `${target.owner}/${target.repo}`,
        }),
        link: {
          href: `https://github.com/${target.owner}/${target.repo}/tree/${branchUrl}${folderUrl}`,
          label: t("openRepo"),
        },
      });

      archiveFileInput.value = "";
      pickZone.classList.remove("has-file");
      pickName.textContent = "";
      pickSize.textContent = "";
      archivePathInput.value = "";
    } catch (error) {
      if (!(error instanceof AppError) && !(error instanceof HttpError)) console.error(error);
      showToast({ kind: "error", title: t("statusError"), info: toUserMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------------

  form.addEventListener("submit", handleSubmit);

  // Clear validation styling as soon as the user edits a field.
  form.addEventListener("input", (event) => {
    const field = event.target.closest(".field");
    if (field) field.classList.remove("is-invalid");
    if (event.target === archivePathInput || event.target === archiveFileInput) {
      pickZone.classList.remove("is-invalid");
    }
  });

  // Token visibility
  revealBtn.addEventListener("click", (event) => {
    event.preventDefault();
    const show = tokenInput.type === "password";
    tokenInput.type = show ? "text" : "password";
    revealBtn.classList.toggle("is-on", show);
    revealBtn.setAttribute("aria-pressed", String(show));
    revealBtn.setAttribute("aria-label", t(show ? "hideToken" : "showToken"));
  });

  // File picker
  archiveFileInput.addEventListener("change", () => {
    const file = archiveFileInput.files && archiveFileInput.files[0];
    if (!file) return;

    archivePathInput.value = "";
    clearInvalid("archivePath");

    pickName.textContent = file.name;
    pickSize.textContent = formatBytes(file.size);
    pickZone.classList.add("has-file");
    pickZone.classList.remove("is-invalid");
  });

  // Only one source: typing a repo path clears the chosen file.
  archivePathInput.addEventListener("input", () => {
    if (!archivePathInput.value.trim()) return;

    archiveFileInput.value = "";
    pickZone.classList.remove("has-file");
    pickName.textContent = "";
    pickSize.textContent = "";
    clearInvalid("archiveFile");
  });

  // Drag & drop onto the picker
  for (const type of ["dragenter", "dragover"]) {
    pickZone.addEventListener(type, (event) => {
      event.preventDefault();
      pickZone.classList.add("is-drag");
    });
  }

  for (const type of ["dragleave", "dragend"]) {
    pickZone.addEventListener(type, () => pickZone.classList.remove("is-drag"));
  }

  pickZone.addEventListener("drop", (event) => {
    event.preventDefault();
    pickZone.classList.remove("is-drag");

    const dropped = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!dropped) return;

    try {
      const transfer = new DataTransfer();
      transfer.items.add(dropped);
      archiveFileInput.files = transfer.files;
    } catch (error) {
      try {
        archiveFileInput.files = event.dataTransfer.files;
      } catch (inner) {
        return;
      }
    }

    archiveFileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Prevent the browser from navigating when a file is dropped outside the picker.
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    if (!event.target.closest || !event.target.closest(".pick")) event.preventDefault();
  });

  // Theme
  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === "dark";
    themeBtn.setAttribute("aria-pressed", String(dark));

    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0a1019" : "#eef2f7");
  }

  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;

    try {
      localStorage.setItem(LS_THEME, next);
    } catch (error) {
      /* storage may be disabled */
    }

    syncThemeButton();
  });

  // Language
  langBtn.addEventListener("click", () => applyLang(lang === "fa" ? "en" : "fa"));

  // Readme dialog
  readmeBtn.addEventListener("click", () => {
    if (typeof readmeDialog.showModal === "function") readmeDialog.showModal();
    else readmeDialog.setAttribute("open", "");
  });

  closeReadme.addEventListener("click", () => readmeDialog.close());

  readmeDialog.addEventListener("click", (event) => {
    if (event.target === readmeDialog) readmeDialog.close();
  });

  // Toast
  toastClose.addEventListener("click", hideToast);

  // Keyboard shortcut: Ctrl/Cmd + Enter submits.
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !busy) {
      event.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true }));
    }
  });

  // ------------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------------

  let storedLang = null;
  try {
    storedLang = localStorage.getItem(LS_LANG);
  } catch (error) {
    /* ignore */
  }

  const browserLang = (navigator.language || "en").toLowerCase();
  applyLang(storedLang || (browserLang.startsWith("fa") ? "fa" : "en"));
  syncThemeButton();
})();
