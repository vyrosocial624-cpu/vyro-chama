import { adminSupabase } from "../supabase-client.js";

const loginPanel = document.querySelector("[data-admin-login]");
const workspace = document.querySelector("[data-admin-workspace]");
const loginForm = document.querySelector("#admin-login-form");
const loginStatus = document.querySelector("[data-admin-status]");
const dashboardStatus = document.querySelector("[data-admin-dashboard-status]");
const adminIdentity = document.querySelector("[data-admin-identity]");
const adminPageLinks = [...document.querySelectorAll("[data-admin-page-link]")];
const adminPagePanels = [...document.querySelectorAll("[data-admin-page-panel]")];
let adminData = null;
let currency = "KES";
const paginationStates = new WeakMap();
const pageSize = 10;
let attendanceSelection = new Map();
let attendanceMeetingId = null;

function showAdminPage(pageId) {
  const activePageId = adminPagePanels.some((panel) => panel.id === pageId)
    ? pageId
    : "admin-overview";

  adminPagePanels.forEach((panel) => {
    panel.hidden = panel.id !== activePageId;
  });
  adminPageLinks.forEach((link) => {
    if (link.dataset.adminPageLink === activePageId) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

window.addEventListener("hashchange", () => {
  showAdminPage(window.location.hash.slice(1));
});
showAdminPage(window.location.hash.slice(1));

function showStatus(element, message) {
  element.textContent = message || "";
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) {
    return "Date not set";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : date.toLocaleDateString();
}

function showEmptyState(container, message) {
  const item = document.createElement("p");
  item.className = "dashboard-empty";
  item.textContent = message;
  container.replaceChildren(item);
}

function renderPaginated(container, items, renderItem, emptyMessage, controlsHost = container) {
  let state = paginationStates.get(container);
  if (!state) {
    const controls = document.createElement("nav");
    controls.className = "list-pagination";
    controls.setAttribute("aria-label", "List pages");
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    const summary = document.createElement("span");
    summary.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    controls.append(previous, summary, next);
    controlsHost.insertAdjacentElement("afterend", controls);
    state = { controls, previous, summary, next, page: 0 };
    paginationStates.set(container, state);
    previous.addEventListener("click", () => {
      state.page -= 1;
      state.draw();
    });
    next.addEventListener("click", () => {
      state.page += 1;
      state.draw();
    });
  }

  state.items = items;
  state.renderItem = renderItem;
  state.emptyMessage = emptyMessage;
  state.page = 0;
  state.draw = () => {
    const pageCount = Math.ceil(state.items.length / pageSize);
    state.page = Math.max(0, Math.min(state.page, pageCount - 1));
    if (state.items.length === 0) {
      if (container instanceof HTMLTableSectionElement) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 9;
        cell.className = "member-directory-empty";
        cell.textContent = state.emptyMessage;
        row.append(cell);
        container.replaceChildren(row);
      } else {
        showEmptyState(container, state.emptyMessage);
      }
    } else {
      const start = state.page * pageSize;
      container.replaceChildren(...state.items.slice(start, start + pageSize).map(state.renderItem));
    }
    state.controls.hidden = pageCount <= 1;
    state.previous.disabled = state.page <= 0;
    state.next.disabled = state.page >= pageCount - 1;
    state.summary.textContent = pageCount > 0
      ? `Page ${state.page + 1} of ${pageCount} · ${state.items.length} items`
      : "0 items";
  };
  state.draw();
}

function makeListItem(title, detail) {
  const item = document.createElement("div");
  item.className = "dashboard-list-item";
  const copy = document.createElement("div");
  copy.className = "dashboard-list-copy";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const subtext = document.createElement("small");
  subtext.textContent = detail;
  copy.append(heading, subtext);
  item.append(copy);
  return item;
}

function fillSelect(select, items, placeholder, getValue, getLabel) {
  const options = [new Option(placeholder, "")];
  items.forEach((item) => options.push(new Option(getLabel(item), getValue(item))));
  select.replaceChildren(...options);
}

function addTableCell(row, text, className = "") {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderMemberDirectory(members) {
  const tableBody = document.querySelector('[data-admin-list="members-table"]');
  renderPaginated(tableBody, members, (member) => {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "member-name-cell";
    const name = document.createElement("strong");
    name.textContent = member.full_name || "Vyro member";
    const details = document.createElement("small");
    details.textContent = [
      member.phone || "No phone number",
      `Since ${formatDate(member.approved_at || member.created_at)}`,
    ].join(" · ");
    nameCell.append(name, details);
    row.append(nameCell);

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `member-account-status status-${member.status}`;
    status.textContent = member.status.replaceAll("_", " ");
    statusCell.append(status);
    row.append(statusCell);

    addTableCell(row, formatCurrency(member.savings_balance), "numeric-cell");
    addTableCell(row, formatCurrency(member.loan_limit), "numeric-cell");
    addTableCell(row, formatCurrency(member.outstanding_balance), "numeric-cell");
    const arrearsCell = addTableCell(row, formatCurrency(member.overdue_arrears), "numeric-cell");
    if (Number(member.overdue_arrears) > 0) {
      arrearsCell.classList.add("has-arrears");
    }

    const attendanceCell = document.createElement("td");
    attendanceCell.className = "numeric-cell";
    attendanceCell.textContent = Number(member.total_meetings) > 0
      ? `${Number(member.attendance_percent) || 0}% (${member.attended_meetings}/${member.total_meetings})`
      : "No meetings";
    row.append(attendanceCell);

    const qualificationCell = document.createElement("td");
    qualificationCell.className = "qualification-cell";
    const percent = Math.max(0, Math.min(100, Number(member.loan_qualification_percent) || 0));
    const qualification = document.createElement("div");
    qualification.className = "qualification-value";
    qualification.textContent = `${percent}%`;
    const progress = document.createElement("progress");
    progress.max = 100;
    progress.value = percent;
    progress.title = "Six checks: 3-month membership, 75% meeting attendance, positive savings, admin loan limit, no active loan, and no pending request.";
    progress.setAttribute("aria-label", `Loan qualification checks: ${percent}%`);
    const hint = document.createElement("small");
    hint.textContent = "6 eligibility checks";
    qualificationCell.append(qualification, progress, hint);
    row.append(qualificationCell);

    const actionCell = document.createElement("td");
    if (member.role !== "admin" && ["approved", "suspended"].includes(member.status)) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = member.status === "approved" ? "member-suspend-button" : "member-restore-button";
      action.dataset.memberAction = member.status === "approved" ? "suspend" : "reinstate";
      action.dataset.memberId = member.id;
      action.textContent = member.status === "approved" ? "Suspend" : "Reinstate";
      action.setAttribute(
        "aria-label",
        `${member.status === "approved" ? "Suspend" : "Reinstate"} ${member.full_name || "member"}`
      );
      actionCell.append(action);
    } else {
      actionCell.textContent = "—";
    }
    row.append(actionCell);
    return row;
  }, "No member records found.", tableBody.closest(".member-directory-scroll"));
}

function renderAttendance(meetingId) {
  const list = document.querySelector('[data-admin-list="attendance"]');
  const meeting = adminData?.meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    attendanceMeetingId = null;
    attendanceSelection = new Map();
    renderPaginated(list, [], () => document.createElement("div"), "Create or select a meeting to record attendance.");
    return;
  }
  const attendedMembers = new Map((meeting.attendance || []).map((entry) => [entry.member_id, entry.attended]));
  const members = adminData.members.filter((member) => member.status === "approved");
  if (attendanceMeetingId !== meetingId) {
    attendanceSelection = new Map(members.map((member) => [
      member.id,
      attendedMembers.get(member.id) === true,
    ]));
    attendanceMeetingId = meetingId;
  }
  renderPaginated(list, members, (member) => {
    const label = document.createElement("label");
    label.className = "attendance-member";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "member_id";
    checkbox.value = member.id;
    checkbox.checked = attendanceSelection.get(member.id) === true;
    const name = document.createElement("span");
    name.textContent = member.full_name || "Vyro member";
    label.append(checkbox, name);
    return label;
  }, "There are no approved members to mark.");
}

function renderDashboard(data, groupSummary) {
  adminData = data;
  currency = groupSummary?.currency || "KES";
  const groupName = groupSummary?.group_name || "Vyro Self Help Group";
  document.title = `Admin dashboard | ${groupName}`;

  const approvedMembers = data.members.filter((member) => member.status === "approved");
  const pendingMembers = data.members.filter((member) => member.status === "pending");
  renderMemberDirectory(data.members);
  const pendingList = document.querySelector('[data-admin-list="pending-members"]');
  renderPaginated(pendingList, pendingMembers, (member) => {
    const item = makeListItem(
      member.full_name || "New member",
      [member.phone, `Requested ${formatDate(member.created_at)}`].filter(Boolean).join(" · ")
    );
    item.classList.add("admin-list-item");
    for (const [status, label] of [["approved", "Approve"], ["rejected", "Reject"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guarantor-action${status === "rejected" ? " decline" : ""}`;
      button.dataset.adminMemberId = member.id;
      button.dataset.adminMemberStatus = status;
      button.textContent = label;
      item.append(button);
    }
    return item;
  }, "There are no pending membership requests.");

  for (const selector of ["#admin-limit-member", "#admin-savings-member"]) {
    fillSelect(
      document.querySelector(selector),
      approvedMembers,
      "Select an approved member",
      (member) => member.id,
      (member) => `${member.full_name || "Vyro member"} · limit ${formatCurrency(member.loan_limit || 0)}`
    );
  }

  const requests = data.requests.filter((request) => request.status === "pending");
  fillSelect(
    document.querySelector("#admin-review-request"),
    requests,
    "Select a request awaiting review",
    (request) => request.id,
    (request) => `${request.full_name} · ${formatCurrency(request.requested_amount)}`
  );
  const requestList = document.querySelector('[data-admin-list="requests"]');
  renderPaginated(requestList, data.requests, (request) => {
    const guarantors = (request.guarantors || [])
      .map((item) => `${item.full_name || "Group member"} (${item.status})`)
      .join(", ");
    const detail = [
      `${request.status}: ${request.purpose}`,
      formatDate(request.created_at),
      guarantors ? `Guarantors: ${guarantors}` : "",
    ].filter(Boolean).join(" · ");
    return makeListItem(`${request.full_name} · ${formatCurrency(request.requested_amount)}`, detail);
  }, "There are no loan requests awaiting guarantors or administrator review.");

  const activeLoans = data.loans.filter((loan) =>
    ["active", "approved"].includes(loan.status) && Number(loan.balance) > 0
  );
  fillSelect(
    document.querySelector("#admin-repayment-loan"),
    activeLoans,
    "Select an active loan",
    (loan) => loan.id,
    (loan) => `${loan.full_name} · balance ${formatCurrency(loan.balance)}`
  );

  const meetingSelect = document.querySelector("#admin-attendance-meeting");
  fillSelect(
    meetingSelect,
    data.meetings,
    "Select a group meeting",
    (meeting) => meeting.id,
    (meeting) => `${meeting.title} · ${formatDate(meeting.starts_at)}`
  );
  if (data.meetings.length > 0) {
    meetingSelect.value = data.meetings[0].id;
  }
  renderAttendance(meetingSelect.value);

  const meetingList = document.querySelector('[data-admin-list="meetings"]');
  renderPaginated(meetingList, data.meetings, (meeting) => makeListItem(
      meeting.title,
      `${formatDate(meeting.starts_at)} · ${meeting.attendance?.filter((item) => item.attended).length || 0} attended`
    ), "No meetings have been scheduled.");

  const auditList = document.querySelector('[data-admin-list="audit"]');
  renderPaginated(auditList, data.audit || [], (entry) => makeListItem(
      entry.action.replaceAll("_", " "),
      `${entry.actor_name || (entry.target_type === "mpesa_payment_records" ? "Payment service" : "Administrator")} · ${entry.target_type}${entry.target_id ? ` ${entry.target_id}` : ""} · ${formatDate(entry.created_at)} · ${JSON.stringify(entry.details || {})}`
    ), "No administrator actions have been recorded yet.");

  const mpesaPayments = document.querySelector('[data-admin-list="mpesa-payments"]');
  renderPaginated(mpesaPayments, data.reviewablePayments || [], (payment) => {
    const member = data.members.find((item) => item.id === payment.member_id);
    const loan = data.loans.find((item) => item.id === payment.loan_id);
    const typeLabel = payment.payment_type === "loan_repayment" ? "Loan repayment" : "Savings contribution";
    const stkReview = payment.source === "stk_push";
    const details = [
      member?.full_name || "Member",
      member?.phone || payment.phone_number,
      stkReview ? "STK prompt needs reconciliation" : payment.manual_reference,
      stkReview && payment.callback_received_amount !== null
        ? `M-Pesa reported ${formatCurrency(payment.callback_received_amount)}`
        : null,
      stkReview && payment.callback_received_phone ? `Paid from ${payment.callback_received_phone}` : null,
      stkReview && payment.callback_received_receipt ? `Callback receipt ${payment.callback_received_receipt}` : null,
      loan?.purpose,
      formatDate(payment.created_at),
    ].filter(Boolean).join(" · ");
    const item = makeListItem(
      `${typeLabel} · ${formatCurrency(payment.amount)}`,
      details
    );
    item.classList.add("admin-list-item", "admin-mpesa-payment");
    const receiptLabel = document.createElement("label");
    receiptLabel.textContent = "Verified receipt code";
    receiptLabel.hidden = !stkReview;
    const receiptInput = document.createElement("input");
    receiptInput.type = "text";
    receiptInput.maxLength = 32;
    receiptInput.pattern = "[A-Za-z0-9]{8,32}";
    receiptInput.placeholder = "Receipt from Paybill statement";
    receiptInput.setAttribute("aria-label", `Verified M-Pesa receipt for ${member?.full_name || "member"}`);
    receiptInput.dataset.mpesaVerifiedReceipt = "";
    receiptInput.hidden = !stkReview;
    receiptInput.required = stkReview;
    const reviewNote = document.createElement("input");
    reviewNote.type = "text";
    reviewNote.maxLength = 500;
    reviewNote.placeholder = "Verification note (optional)";
    reviewNote.setAttribute("aria-label", `Review note for ${payment.manual_reference || "STK payment"}`);
    reviewNote.dataset.mpesaReviewNote = "";
    item.append(receiptLabel, receiptInput, reviewNote);
    for (const [decision, label] of [["approve", "Verify & post"], ["reject", "Reject"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guarantor-action${decision === "reject" ? " decline" : ""}`;
      button.dataset.mpesaReview = decision;
      button.dataset.paymentId = payment.id;
      button.textContent = label;
      item.append(button);
    }
    return item;
  }, "No M-Pesa payments are awaiting review.");

  const withdrawalRequests = document.querySelector('[data-admin-list="withdrawal-requests"]');
  renderPaginated(withdrawalRequests, data.withdrawalRequests || [], (request) => {
    const member = data.members.find((item) => item.id === request.member_id);
    const balance = Number(member?.savings_balance) || 0;
    const item = makeListItem(
      `${member?.full_name || "Member"} · ${formatCurrency(request.amount)}`,
      `${member?.phone || "No phone"} · Available savings ${formatCurrency(balance)} · ${formatDate(request.created_at)} · Reason: ${request.reason}`
    );
    item.classList.add("admin-list-item", "admin-withdrawal-request");
    const reviewNote = document.createElement("input");
    reviewNote.type = "text";
    reviewNote.maxLength = 500;
    reviewNote.placeholder = "Administrator note (optional)";
    reviewNote.setAttribute("aria-label", `Review note for withdrawal request from ${member?.full_name || "member"}`);
    reviewNote.dataset.withdrawalReviewNote = "";
    item.append(reviewNote);
    for (const [decision, label] of [["approve", "Approve & record"], ["reject", "Reject"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `guarantor-action${decision === "reject" ? " decline" : ""}`;
      button.dataset.withdrawalReview = decision;
      button.dataset.requestId = request.id;
      button.textContent = label;
      item.append(button);
    }
    return item;
  }, "There are no savings withdrawal requests awaiting review.");
}

async function loadAdminDashboard() {
  showStatus(dashboardStatus, "Loading administrator dashboard…");
  const [dashboardResult, summaryResult, mpesaPaymentsResult, withdrawalRequestsResult] = await Promise.all([
    adminSupabase.rpc("admin_get_dashboard_data"),
    adminSupabase.rpc("get_member_group_summary"),
    adminSupabase
      .from("mpesa_payment_records")
      .select("id, member_id, payment_type, loan_id, source, amount, phone_number, manual_reference, callback_received_amount, callback_received_phone, callback_received_receipt, status, created_at")
      .or("and(source.eq.manual,status.eq.pending),and(source.eq.stk_push,status.eq.needs_review)")
      .order("created_at", { ascending: true }),
    adminSupabase
      .from("savings_withdrawal_requests")
      .select("id, member_id, amount, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);
  if (dashboardResult.error || summaryResult.error || mpesaPaymentsResult.error || withdrawalRequestsResult.error) {
    const error = dashboardResult.error || summaryResult.error || mpesaPaymentsResult.error || withdrawalRequestsResult.error;
    throw new Error(`Could not load administrator dashboard: ${error.message}. Confirm the latest Supabase setup has been applied.`);
  }
  if (dashboardResult.data?.member_metrics_version !== 2) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "member-directory-empty";
    cell.textContent = "Run the updated Supabase setup to load the complete member and admin histories.";
    row.append(cell);
    document.querySelector('[data-admin-list="members-table"]').replaceChildren(row);
    throw new Error("The latest member metrics and complete admin history require the updated supabase-setup.sql. Run it in Supabase SQL Editor, then reload this page.");
  }
  const summary = summaryResult.data?.[0];
  renderDashboard({
    ...dashboardResult.data,
    reviewablePayments: mpesaPaymentsResult.data || [],
    withdrawalRequests: withdrawalRequestsResult.data || [],
  }, summary);
  showStatus(dashboardStatus, "");
}

async function verifyAdministrator(user) {
  const { data: role, error } = await adminSupabase.rpc("get_my_portal_role");
  if (error) {
    showStatus(loginStatus, `Could not verify administrator access: ${error.message}`);
    return false;
  }
  if (role !== "admin") {
    const { error: signOutError } = await adminSupabase.auth.signOut();
    showStatus(loginStatus, signOutError
      ? `This account does not have administrator access. Could not clear its separate admin session: ${signOutError.message}`
      : "This account does not have administrator access. Ask a group administrator to assign your role.");
    return false;
  }

  loginPanel.hidden = true;
  workspace.hidden = false;
  adminIdentity.textContent = user.email || "Administrator";
  showStatus(loginStatus, "");
  try {
    await loadAdminDashboard();
  } catch (error) {
    showStatus(dashboardStatus, error instanceof Error ? error.message : "Unable to load administrator dashboard.");
  }
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  showStatus(loginStatus, "Signing in…");
  try {
    const formData = new FormData(loginForm);
    const { data, error } = await adminSupabase.auth.signInWithPassword({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    if (error) {
      showStatus(loginStatus, `Sign-in failed: ${error.message}`);
      return;
    }
    if (!data.user) {
      showStatus(loginStatus, "Sign-in succeeded but no user account was returned.");
      return;
    }
    await verifyAdministrator(data.user);
  } catch (error) {
    showStatus(loginStatus, error instanceof Error ? error.message : "Unable to sign in.");
  } finally {
    button.disabled = false;
  }
});

document.querySelector("[data-admin-signout]").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const { error } = await adminSupabase.auth.signOut();
    if (error) {
      showStatus(dashboardStatus, `Unable to sign out: ${error.message}`);
      return;
    }
    adminData = null;
    workspace.hidden = true;
    loginPanel.hidden = false;
    loginForm.reset();
    showStatus(loginStatus, "You have been signed out.");
  } finally {
    button.disabled = false;
  }
});

async function submitAdminRpc(form, functionName, makeArgs, successMessage) {
  const button = form.querySelector("button[type='submit']");
  let status = form.querySelector("[data-form-message]");
  if (!status) {
    status = document.createElement("p");
    status.dataset.formMessage = "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    form.append(status);
  }
  button.disabled = true;
  status.textContent = "Saving…";
  try {
    const { error } = await adminSupabase.rpc(functionName, makeArgs(new FormData(form)));
    if (error) {
      status.textContent = `Unable to save: ${error.message}`;
      return;
    }
    status.textContent = successMessage;
    form.reset();
    if (form.id === "admin-attendance-form") {
      attendanceMeetingId = null;
      attendanceSelection = new Map();
    }
    await loadAdminDashboard();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Unable to save the change.";
  } finally {
    button.disabled = false;
  }
}

function attachAdminRpc(form, functionName, makeArgs, successMessage) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitAdminRpc(form, functionName, makeArgs, successMessage);
  });
}

document.querySelector('[data-admin-list="pending-members"]').addEventListener("click", async (event) => {
  const button = event.target.closest("[data-admin-member-id]");
  if (!button) {
    return;
  }
  button.disabled = true;
  showStatus(dashboardStatus, "Updating member access…");
  const { error } = await adminSupabase.rpc("admin_set_member_status", {
    p_member_id: button.dataset.adminMemberId,
    p_status: button.dataset.adminMemberStatus,
  });
  if (error) {
    button.disabled = false;
    showStatus(dashboardStatus, `Unable to update member access: ${error.message}`);
    return;
  }
  showStatus(dashboardStatus, `Member request ${button.dataset.adminMemberStatus}.`);
  try {
    await loadAdminDashboard();
  } catch (loadError) {
    showStatus(dashboardStatus, loadError instanceof Error ? loadError.message : "Unable to refresh dashboard.");
  }
});

document.querySelector('[data-admin-list="mpesa-payments"]').addEventListener("click", async (event) => {
  const button = event.target.closest("[data-mpesa-review]");
  if (!button) {
    return;
  }
  const payment = adminData?.reviewablePayments?.find((item) => item.id === button.dataset.paymentId);
  if (!payment) {
    showStatus(dashboardStatus, "This M-Pesa payment is no longer in the review queue. Refresh the dashboard.");
    return;
  }
  const approve = button.dataset.mpesaReview === "approve";
  const member = adminData.members.find((item) => item.id === payment.member_id);
  const confirmation = approve
    ? payment.source === "stk_push"
      ? `Have you verified this STK payment for ${member?.full_name || "this member"} against the Paybill statement? Approving will post ${formatCurrency(payment.amount)} as ${payment.payment_type === "savings" ? "savings" : "a loan repayment"}.`
      : `Have you verified M-Pesa reference ${payment.manual_reference} for ${member?.full_name || "this member"} against the Paybill statement? Approving will post ${formatCurrency(payment.amount)} as ${payment.payment_type === "savings" ? "savings" : "a loan repayment"}.`
    : `Reject this M-Pesa payment? It will not be posted to the member ledger.`;
  if (!window.confirm(confirmation)) {
    return;
  }

  button.disabled = true;
  showStatus(dashboardStatus, approve ? "Verifying and posting M-Pesa payment…" : "Rejecting M-Pesa payment…");
  const item = button.closest(".admin-mpesa-payment");
  const note = item?.querySelector("[data-mpesa-review-note]")?.value || "";
  const verifiedReceipt = item?.querySelector("[data-mpesa-verified-receipt]")?.value.trim() || "";
  if (approve && payment.source === "stk_push" && !/^[A-Za-z0-9]{8,32}$/.test(verifiedReceipt)) {
    button.disabled = false;
    showStatus(dashboardStatus, "Enter the verified M-Pesa receipt code from the Paybill statement before approving.");
    return;
  }
  try {
    const { error } = await adminSupabase.rpc("admin_review_mpesa_payment", {
      p_payment_id: payment.id,
      p_approve: approve,
      p_review_note: note,
      p_verified_receipt: verifiedReceipt || null,
    });
    if (error) {
      button.disabled = false;
      showStatus(dashboardStatus, `Unable to review M-Pesa payment: ${error.message}`);
      return;
    }
    showStatus(dashboardStatus, approve ? "Verified M-Pesa payment posted to the correct ledger." : "M-Pesa payment rejected.");
    await loadAdminDashboard();
  } catch (error) {
    button.disabled = false;
    showStatus(dashboardStatus, error instanceof Error ? error.message : "Unable to review M-Pesa payment.");
  }
});

document.querySelector('[data-admin-list="withdrawal-requests"]').addEventListener("click", async (event) => {
  const button = event.target.closest("[data-withdrawal-review]");
  if (!button) {
    return;
  }
  const request = adminData?.withdrawalRequests?.find((item) => item.id === button.dataset.requestId);
  if (!request) {
    showStatus(dashboardStatus, "This withdrawal request is no longer awaiting review. Refresh the dashboard.");
    return;
  }
  const approve = button.dataset.withdrawalReview === "approve";
  const member = adminData.members.find((item) => item.id === request.member_id);
  const confirmation = approve
    ? `Approve ${member?.full_name || "this member"}'s ${formatCurrency(request.amount)} withdrawal request? Approval records the withdrawal in savings; arrange the payout separately.`
    : `Reject ${member?.full_name || "this member"}'s ${formatCurrency(request.amount)} withdrawal request?`;
  if (!window.confirm(confirmation)) {
    return;
  }

  button.disabled = true;
  showStatus(dashboardStatus, approve ? "Approving withdrawal request…" : "Rejecting withdrawal request…");
  const item = button.closest(".admin-withdrawal-request");
  const note = item?.querySelector("[data-withdrawal-review-note]")?.value || "";
  try {
    const { error } = await adminSupabase.rpc("admin_review_savings_withdrawal", {
      p_request_id: request.id,
      p_approve: approve,
      p_admin_note: note,
    });
    if (error) {
      button.disabled = false;
      showStatus(dashboardStatus, `Unable to review withdrawal request: ${error.message}`);
      return;
    }
    showStatus(dashboardStatus, approve
      ? "Withdrawal approved and recorded in savings. Arrange the payout separately."
      : "Withdrawal request rejected.");
    await loadAdminDashboard();
  } catch (error) {
    button.disabled = false;
    showStatus(dashboardStatus, error instanceof Error ? error.message : "Unable to review withdrawal request.");
  }
});

document.querySelector('[data-admin-list="members-table"]').addEventListener("click", async (event) => {
  const button = event.target.closest("[data-member-action]");
  if (!button) {
    return;
  }

  const shouldSuspend = button.dataset.memberAction === "suspend";
  const member = adminData?.members.find((item) => item.id === button.dataset.memberId);
  const memberName = member?.full_name || "this member";
  const confirmation = shouldSuspend
    ? `Suspend ${memberName}'s portal access? They will no longer be able to use member-only features.`
    : `Restore ${memberName}'s member portal access?`;
  if (!window.confirm(confirmation)) {
    return;
  }

  button.disabled = true;
  showStatus(dashboardStatus, shouldSuspend ? "Suspending member access…" : "Restoring member access…");
  try {
    const { error } = await adminSupabase.rpc("admin_suspend_member", {
      p_member_id: button.dataset.memberId,
      p_suspend: shouldSuspend,
    });
    if (error) {
      button.disabled = false;
      showStatus(dashboardStatus, `Unable to ${shouldSuspend ? "suspend" : "reinstate"} member: ${error.message}`);
      return;
    }
    showStatus(dashboardStatus, shouldSuspend ? "Member access suspended." : "Member access restored.");
    await loadAdminDashboard();
  } catch (error) {
    button.disabled = false;
    showStatus(dashboardStatus, error instanceof Error ? error.message : "Unable to update member access.");
  }
});

attachAdminRpc(
  document.querySelector("#admin-limit-form"),
  "admin_set_member_loan_limit",
  (formData) => ({ p_member_id: formData.get("member_id"), p_loan_limit: Number(formData.get("loan_limit")) }),
  "Member loan limit saved."
);
attachAdminRpc(
  document.querySelector("#admin-savings-form"),
  "admin_record_savings",
  (formData) => ({
    p_member_id: formData.get("member_id"),
    p_amount: Number(formData.get("amount")),
    p_entry_type: formData.get("entry_type"),
    p_description: formData.get("description"),
  }),
  "Savings transaction recorded."
);
attachAdminRpc(
  document.querySelector("#admin-loan-review-form"),
  "admin_review_loan_request",
  (formData) => {
    const approve = formData.get("approve") === "approve";
    return {
      p_request_id: formData.get("request_id"),
      p_approve: approve,
      p_term_months: approve ? Number(formData.get("term_months")) : null,
      p_total_due: approve ? Number(formData.get("total_due")) : null,
      p_first_due_date: approve ? (formData.get("first_due_date") || null) : null,
      p_admin_note: formData.get("admin_note"),
    };
  },
  "Loan decision saved."
);
attachAdminRpc(
  document.querySelector("#admin-repayment-form"),
  "admin_record_repayment",
  (formData) => ({
    p_loan_id: formData.get("loan_id"),
    p_amount: Number(formData.get("amount")),
    p_note: formData.get("note"),
  }),
  "Repayment recorded."
);
attachAdminRpc(
  document.querySelector("#admin-announcement-form"),
  "admin_publish_announcement",
  (formData) => ({ p_title: formData.get("title"), p_body: formData.get("body") }),
  "Announcement published and notifications sent."
);
attachAdminRpc(
  document.querySelector("#admin-meeting-form"),
  "admin_create_meeting",
  (formData) => ({
    p_title: formData.get("title"),
    p_starts_at: new Date(formData.get("starts_at")).toISOString(),
    p_location: formData.get("location"),
  }),
  "Meeting created and attendance list initialized."
);
attachAdminRpc(
  document.querySelector("#admin-attendance-form"),
  "admin_save_meeting_attendance",
  (formData) => ({
    p_meeting_id: formData.get("meeting_id"),
    p_attendance: (adminData?.members || [])
      .filter((member) => member.status === "approved")
      .map((member) => ({
        member_id: member.id,
        attended: attendanceSelection.get(member.id) === true,
      })),
  }),
  "Meeting attendance saved."
);

document.querySelector('[data-admin-list="attendance"]').addEventListener("change", (event) => {
  const checkbox = event.target.closest('input[type="checkbox"][name="member_id"]');
  if (checkbox) {
    attendanceSelection.set(checkbox.value, checkbox.checked);
  }
});

document.querySelector("#admin-attendance-meeting").addEventListener("change", (event) => {
  renderAttendance(event.currentTarget.value);
});

async function initialize() {
  const { data, error } = await adminSupabase.auth.getSession();
  if (error) {
    showStatus(loginStatus, `Could not restore administrator session: ${error.message}`);
    return;
  }
  if (data.session?.user) {
    await verifyAdministrator(data.session.user);
  }
}

void initialize();
