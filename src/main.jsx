import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import landingMarkup from "./templates/landing.html?raw";
import loanRulesMarkup from "./templates/loan-rules.html?raw";
import privacyMarkup from "./templates/privacy.html?raw";
import adminMarkup from "../admin/admin-template.html?raw";
import "../styles.css";
import "../admin/admin.css";

const documents = {
  landing: { markup: landingMarkup, script: () => import("../script.js") },
  admin: { markup: adminMarkup, script: () => import("../admin/admin.js") },
  loanRules: { markup: loanRulesMarkup },
  privacy: { markup: privacyMarkup },
};

function getPage(pathname) {
  if (pathname.startsWith("/admin")) return documents.admin;
  if (pathname.endsWith("/loan-rules.html")) return documents.loanRules;
  if (pathname.endsWith("/privacy.html")) return documents.privacy;
  return documents.landing;
}

function parsePage(markup) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  if (!parsed.body || !parsed.querySelector("title")) {
    throw new Error("A page template is missing its body or title.");
  }
  return {
    bodyClass: parsed.body.className,
    title: parsed.title,
    content: parsed.body.innerHTML,
  };
}

function PageFrame({ page }) {
  const documentContent = parsePage(page.markup);

  useEffect(() => {
    document.title = documentContent.title;
    document.body.className = documentContent.bodyClass;
    if (page.script) page.script();
  }, [documentContent.bodyClass, documentContent.title, page]);

  return (
    <div
      className="react-page"
      dangerouslySetInnerHTML={{ __html: documentContent.content }}
    />
  );
}

function App() {
  const page = getPage(window.location.pathname);
  return <PageFrame page={page} />;
}

createRoot(document.getElementById("root")).render(<App />);
