import { supabase } from "./supabase-client.js";

const menuToggle = document.querySelector(".menu-toggle");
const primaryNav = document.querySelector("#primary-nav");
const navClose = document.querySelector(".nav-close");
const navBackdrop = document.querySelector(".nav-backdrop");
const year = document.querySelector("#year");
const portalDialog = document.querySelector("#member-portal");
const portalTabs = document.querySelectorAll("[data-portal-tab]");
const portalForms = document.querySelectorAll("[data-portal-form]");
const portalMessage = document.querySelector(".portal-message");
const loginVerificationForm = document.querySelector("#login-verification-form");
const loginVerificationEmail = document.querySelector("#login-verification-email");
const loginVerificationCode = document.querySelector("#login-verification-code");
const resendLoginCodeButton = document.querySelector("#resend-login-code");
const signupVerificationForm = document.querySelector("#signup-verification-form");
const signupVerificationEmail = document.querySelector("#signup-verification-email");
const signupVerificationCode = document.querySelector("#signup-verification-code");
const resendSignupCodeButton = document.querySelector("#resend-signup-code");
const recoveryVerificationForm = document.querySelector("#recovery-verification-form");
const recoveryVerificationEmail = document.querySelector("#recovery-verification-email");
const recoveryVerificationCode = document.querySelector("#recovery-verification-code");
const resendRecoveryCodeButton = document.querySelector("#resend-recovery-code");
const portalTitle = document.querySelector("#portal-title");
const portalIntro = document.querySelector(".portal-intro");
const portalAccount = document.querySelector(".portal-account");
const portalAccountEmail = document.querySelector(".portal-account-email");
const portalAccountName = document.querySelector(".portal-account-name");
const portalNotice = document.querySelector(".portal-notice");
const dashboardMessage = document.querySelector(".dashboard-message");
const dashboardNav = document.querySelector(".dashboard-nav");
const dashboardPanels = document.querySelectorAll("[data-dashboard-panel]");
const dashboardMetrics = document.querySelectorAll("[data-metric]");
const loanRequestForm = document.querySelector("#loan-request-form");
const loanAmountInput = document.querySelector("#loan-request-amount");
const loanPurposeInput = document.querySelector("#loan-request-purpose");
const loanRequestButton = document.querySelector(".loan-request-submit");
const loanEligibilityMessage = document.querySelector("[data-loan-eligibility]");
const loanAvailableLimit = document.querySelector("[data-loan-available]");
const loanLimitRefreshButton = document.querySelector("[data-refresh-loan-limit]");
const loanRequestResult = document.querySelector("[data-loan-request-result]");
const memberPaymentForm = document.querySelector("#member-payment-form");
const memberPaymentType = document.querySelector("#member-payment-type");
const memberPaymentLoan = document.querySelector("#member-payment-loan");
const memberPaymentMethod = document.querySelector("#member-payment-method");
const memberPaymentReference = document.querySelector("#member-payment-reference");
const memberPaymentPhone = document.querySelector("#member-payment-phone");
const memberPaymentHelper = document.querySelector("[data-member-payment-helper]");
const memberPaymentMessage = document.querySelector("[data-member-payment-message]");
const withdrawalRequestForm = document.querySelector("#withdrawal-request-form");
const withdrawalRequestMessage = document.querySelector("[data-withdrawal-request-message]");
const withdrawalRequestAmount = document.querySelector("#withdrawal-request-amount");
const recoveryForm = document.querySelector("#password-recovery-form");
const accountProfileForm = document.querySelector("#account-profile-form");
const guarantorPanel = document.querySelector("[data-guarantor-panel]");
const guarantorForm = document.querySelector("#guarantor-form");
const guarantorMessage = document.querySelector("[data-guarantor-message]");
const guarantorOne = document.querySelector("#guarantor-one");
const guarantorTwo = document.querySelector("#guarantor-two");
let activeMember = null;
let activeMemberProfile = null;
let currentLoanEligibility = null;
let currentLoanRequests = [];
let currentGroupMembers = [];
let currentStatementData = null;
const dashboardPagination = new WeakMap();
const dashboardPageSize = 10;

if (year) {
  year.textContent = String(new Date().getFullYear());
}

function setPortalMessage(message) {
  if (portalMessage) {
    portalMessage.textContent = message;
  }
}

function showSignupVerification(email) {
  hideEmailCodeForms();
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = true;
  });
  portalForms.forEach((form) => {
    form.hidden = true;
  });
  if (recoveryForm) recoveryForm.hidden = true;
  if (portalAccount) portalAccount.hidden = true;
  if (signupVerificationEmail) signupVerificationEmail.value = email;
  if (signupVerificationCode) signupVerificationCode.value = "";
  if (signupVerificationForm) signupVerificationForm.hidden = false;
  if (portalTitle) portalTitle.textContent = "Verify your email";
  if (portalIntro) {
    portalIntro.textContent = "Enter the six-digit code we sent to your email to confirm your address and submit your membership request.";
  }
  setPortalMessage(`A verification code was sent to ${email}.`);
  signupVerificationCode?.focus();
}

function hideEmailCodeForms() {
  [loginVerificationForm, signupVerificationForm, recoveryVerificationForm].forEach((form) => {
    if (form) form.hidden = true;
  });
}

function showEmailCodeForm(form, emailInput, codeInput, email, { title, intro, message }) {
  if (!form || !emailInput || !codeInput) return;
  hideEmailCodeForms();
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = true;
  });
  portalForms.forEach((portalForm) => {
    portalForm.hidden = true;
  });
  if (recoveryForm) recoveryForm.hidden = true;
  if (portalAccount) portalAccount.hidden = true;
  if (portalNotice) portalNotice.hidden = false;
  emailInput.value = email;
  codeInput.value = "";
  form.hidden = false;
  portalTitle.textContent = title;
  portalIntro.textContent = intro;
  setPortalMessage(message);
  codeInput.focus();
}

async function runPortalAction(action) {
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unexpected error.";
    setPortalMessage(`Portal request failed: ${detail}`);
  }
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function setDashboardText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function showEmptyState(container, message) {
  const item = document.createElement(container instanceof HTMLUListElement ? "li" : "p");
  item.className = "dashboard-empty";
  item.textContent = message;
  container.replaceChildren(item);
}

function renderPaginatedList(container, items, renderItem, emptyMessage) {
  let state = dashboardPagination.get(container);
  if (!state) {
    const controls = document.createElement("nav");
    controls.className = "list-pagination";
    const listNames = {
      "mpesa-payments": "Recent M-Pesa payments",
      savings: "Savings activity",
    };
    const listName = listNames[container.dataset.dashboardList] || "Dashboard list";
    controls.setAttribute("aria-label", `${listName} pages`);
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    const summary = document.createElement("span");
    summary.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    controls.append(previous, summary, next);
    container.insertAdjacentElement("afterend", controls);
    state = { controls, previous, summary, next, page: 0 };
    dashboardPagination.set(container, state);
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
    const pageCount = Math.ceil(state.items.length / dashboardPageSize);
    state.page = Math.max(0, Math.min(state.page, pageCount - 1));
    if (state.items.length === 0) {
      showEmptyState(container, state.emptyMessage);
    } else {
      const start = state.page * dashboardPageSize;
      container.replaceChildren(...state.items.slice(start, start + dashboardPageSize).map(state.renderItem));
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

function populateGuarantorSelect(select, members, currentMemberId) {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a group member";
  const options = members
    .filter((member) => member.id !== currentMemberId)
    .map((member) => {
      const option = document.createElement("option");
      option.value = member.id;
      option.textContent = member.full_name || "Group member";
      return option;
    });
  select.replaceChildren(placeholder, ...options);
  select.disabled = options.length < 2;
  const submit = document.querySelector(".guarantor-submit");
  if (submit) {
    submit.disabled = options.length < 2;
  }
  if (options.length < 2 && guarantorMessage) {
    guarantorMessage.textContent = "At least two other approved group members are needed to continue.";
  }
}

function makeDashboardListItem(title, detail, amountText = "") {
  const item = document.createElement("li");
  item.className = "dashboard-list-item";
  const copy = document.createElement("div");
  copy.className = "dashboard-list-copy";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const subtext = document.createElement("small");
  subtext.textContent = detail;
  copy.append(heading, subtext);
  item.append(copy);
  if (amountText) {
    const amount = document.createElement("span");
    amount.className = "dashboard-list-amount";
    amount.textContent = amountText;
    item.append(amount);
  }
  return item;
}

function setDashboardView(name) {
  document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
    const active = button.dataset.dashboardView === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  dashboardPanels.forEach((panel) => {
    const active = panel.dataset.dashboardPanel === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
}

function updateLoanEligibility(loanEligibility) {
  currentLoanEligibility = loanEligibility;
  const currency = loanEligibility.currency || "KES";
  const adminLoanLimit = Number(loanEligibility.loan_limit);
  const requestLimit = Number(loanEligibility.max_request_amount) || 0;
  const loanLimit = document.querySelector("[data-loan-limit]");
  const loanCurrency = document.querySelector("[data-loan-currency]");
  const loanMaxHint = document.querySelector("[data-loan-max-hint]");

  if (loanCurrency) {
    loanCurrency.textContent = currency;
  }
  if (loanLimit) {
    loanLimit.textContent = !Number.isFinite(adminLoanLimit) || adminLoanLimit <= 0
      ? "Not set by group admin"
      : formatCurrency(adminLoanLimit, currency);
  }
  if (loanAvailableLimit) {
    loanAvailableLimit.textContent = formatCurrency(requestLimit, currency);
  }
  if (loanAmountInput) {
    loanAmountInput.max = String(requestLimit);
    loanAmountInput.disabled = !loanEligibility.eligible;
  }
  if (loanPurposeInput) {
    loanPurposeInput.disabled = !loanEligibility.eligible;
  }
  if (loanMaxHint) {
    loanMaxHint.textContent = !Number.isFinite(adminLoanLimit) || adminLoanLimit <= 0
      ? "The group administrator must set your limit before you can request a loan."
      : `Your request is capped at ${formatCurrency(requestLimit, currency)} (the lower of your admin-set limit or 3× current savings).`;
  }
  if (loanEligibilityMessage) {
    loanEligibilityMessage.textContent = loanEligibility.eligible
      ? `You are eligible to submit a request up to ${formatCurrency(requestLimit, currency)}. The group will review it.`
      : loanEligibility.reason;
    loanEligibilityMessage.classList.toggle("is-eligible", loanEligibility.eligible);
    loanEligibilityMessage.classList.toggle("is-ineligible", !loanEligibility.eligible);
  }
  if (loanRequestButton) {
    loanRequestButton.disabled = !loanEligibility.eligible;
  }
}

function updateMemberPaymentFields() {
  const paymentType = memberPaymentType?.value || "savings";
  const paymentMethod = memberPaymentMethod?.value || "stk_push";
  const loanField = document.querySelector("[data-payment-loan-field]");
  const referenceField = document.querySelector("[data-payment-reference-field]");
  const submitButton = memberPaymentForm?.querySelector("button[type='submit']");
  const loanRequired = paymentType === "loan_repayment";
  const manualPayment = paymentMethod === "manual";

  if (loanField) {
    loanField.hidden = !loanRequired;
  }
  if (memberPaymentLoan) {
    memberPaymentLoan.required = loanRequired;
  }
  if (referenceField) {
    referenceField.hidden = !manualPayment;
  }
  if (memberPaymentReference) {
    memberPaymentReference.required = manualPayment;
  }
  if (memberPaymentHelper) {
    memberPaymentHelper.textContent = manualPayment
      ? "Your payment will remain pending until an administrator verifies the transaction code and amount."
      : "We will send an M-Pesa prompt to your phone. Confirm the type and amount before entering your PIN.";
  }
  if (submitButton) {
    submitButton.innerHTML = manualPayment
      ? "Submit reference for review <span aria-hidden=\"true\">→</span>"
      : "Send STK prompt <span aria-hidden=\"true\">→</span>";
  }
}

function renderDashboard({
  user,
  profile,
  summary,
  members,
  savings,
  loans,
  repayments,
  repaymentSchedule,
  notifications,
  announcements,
  eligibility,
  loanRequests,
  sentGuarantees,
  receivedGuarantees,
  receivedRequests,
  transparency,
  paymentRecords,
  withdrawalRequests,
}) {
  const group = summary[0];
  if (!group) {
    throw new Error("No group settings were found. Apply the dashboard SQL setup and try again.");
  }
  const currency = group.currency || "KES";
  const loanEligibility = eligibility[0];
  if (!loanEligibility) {
    throw new Error("Could not verify loan eligibility. Please contact the group administrator.");
  }
  currentLoanEligibility = loanEligibility;
  const groupName = group.group_name || "Vyro Self Help Group";
  const memberName = profile.full_name || user.user_metadata?.full_name || "Vyro member";
  currentLoanRequests = loanRequests;
  currentGroupMembers = members;

  document.querySelectorAll(".dashboard-group-name, .inline-group-name").forEach((element) => {
    element.textContent = groupName;
  });
  setDashboardText(".dashboard-welcome-name", memberName);
  setDashboardText(".dashboard-member-since", `Member since ${formatDate(profile.approved_at || profile.created_at)}`);
  setDashboardText(
    ".dashboard-meeting-date",
    group.next_meeting_at ? formatDate(group.next_meeting_at) : "No meeting scheduled"
  );
  setDashboardText(".dashboard-meeting-location", group.meeting_location || "Meeting details not added yet");

  const savingsBalance = savings.reduce((total, transaction) => {
    const amount = Number(transaction.amount) || 0;
    return total + (transaction.entry_type === "withdrawal" ? -amount : amount);
  }, 0);
  const availableSavings = Math.max(savingsBalance, 0);
  const hasPendingWithdrawal = withdrawalRequests.some((request) => request.status === "pending");
  const canRequestWithdrawal = availableSavings > 0 && !hasPendingWithdrawal;
  setDashboardText("[data-withdrawal-balance]", `Available balance: ${formatCurrency(availableSavings, currency)}`);
  setDashboardText(
    "[data-withdrawal-request-guidance]",
    hasPendingWithdrawal
      ? "Your request is awaiting administrator review. You can submit another request after it is decided."
      : availableSavings > 0
        ? "Submit your amount and reason for administrator review. Approval records the withdrawal in your savings ledger; payout is arranged separately by the group."
        : "You need a positive recorded savings balance before requesting a withdrawal."
  );
  if (withdrawalRequestAmount) {
    withdrawalRequestAmount.max = availableSavings.toFixed(2);
    withdrawalRequestAmount.disabled = !canRequestWithdrawal;
  }
  const withdrawalReason = withdrawalRequestForm?.querySelector("textarea[name='reason']");
  if (withdrawalReason) {
    withdrawalReason.disabled = !canRequestWithdrawal;
  }
  const withdrawalSubmit = withdrawalRequestForm?.querySelector("button[type='submit']");
  if (withdrawalSubmit) {
    withdrawalSubmit.disabled = !canRequestWithdrawal;
  }
  const repaymentTotals = new Map();
  const scheduledBalances = new Map();
  repayments.forEach((repayment) => {
    repaymentTotals.set(
      repayment.loan_id,
      (repaymentTotals.get(repayment.loan_id) || 0) + (Number(repayment.amount) || 0)
    );
  });
  repaymentSchedule.forEach((installment) => {
    scheduledBalances.set(
      installment.loan_id,
      (scheduledBalances.get(installment.loan_id) || 0)
        + Number(installment.amount) - Number(installment.paid_amount)
    );
  });
  const activeLoans = loans.filter((loan) => ["approved", "active"].includes(loan.status));
  const loanBalance = activeLoans.reduce(
    (total, loan) => total + Math.max(0, scheduledBalances.has(loan.id)
      ? scheduledBalances.get(loan.id)
      : Number(loan.principal) - (repaymentTotals.get(loan.id) || 0)),
    0
  );
  const metrics = {
    members: String(group.member_count || 0),
    "group-savings": formatCurrency(group.savings_balance, currency),
    "group-loans": String(group.active_loan_count || 0),
    "group-loan-balance": `Outstanding balance ${formatCurrency(group.active_loan_balance, currency)}`,
    "available-funds": formatCurrency(transparency[0]?.available_lending_funds || 0, currency),
    "my-savings": formatCurrency(savingsBalance, currency),
    "my-loans": formatCurrency(loanBalance, currency),
    "my-savings-page": formatCurrency(savingsBalance, currency),
    "contribution-count": String(savings.filter((entry) => entry.entry_type === "contribution").length),
    "my-loans-page": formatCurrency(loanBalance, currency),
    "my-loan-count": String(activeLoans.length),
  };
  dashboardMetrics.forEach((element) => {
    if (Object.prototype.hasOwnProperty.call(metrics, element.dataset.metric)) {
      element.textContent = metrics[element.dataset.metric];
    }
  });
  const profileNameInput = document.querySelector("#profile-full-name");
  const profilePhoneInput = document.querySelector("#profile-phone");
  if (profileNameInput) {
    profileNameInput.value = profile.full_name || user.user_metadata?.full_name || "";
  }
  if (profilePhoneInput) {
    profilePhoneInput.value = profile.phone || user.user_metadata?.phone || "";
  }
  if (memberPaymentPhone && !memberPaymentPhone.value) {
    memberPaymentPhone.value = profile.phone || user.user_metadata?.phone || "";
  }
  if (memberPaymentLoan) {
    const repaymentLoans = loans.filter((loan) => ["approved", "active"].includes(loan.status));
    const options = [new Option(
      repaymentLoans.length ? "Select an active loan" : "No active loan to repay",
      ""
    )];
    repaymentLoans.forEach((loan) => {
      options.push(new Option(
        `${loan.purpose || "Loan"} · ${formatCurrency(loan.principal, currency)}`,
        loan.id
      ));
    });
    memberPaymentLoan.replaceChildren(...options);
    memberPaymentLoan.disabled = repaymentLoans.length === 0;
    const loanPaymentOption = memberPaymentType.querySelector('option[value="loan_repayment"]');
    if (loanPaymentOption) {
      loanPaymentOption.disabled = repaymentLoans.length === 0;
      if (loanPaymentOption.selected) {
        memberPaymentType.value = "savings";
      }
    }
  }
  updateMemberPaymentFields();
  currentStatementData = {
    savings,
    loans,
    repayments,
    repaymentSchedule,
    currency,
    loanRequests,
    sentGuarantees,
    groupMembers: members,
  };

  const notificationCount = notifications.filter((notification) => !notification.read_at).length;
  const notificationCountElement = document.querySelector("[data-notification-count]");
  if (notificationCountElement) {
    notificationCountElement.textContent = `${notificationCount} unread`;
  }
  const notificationList = document.querySelector('[data-dashboard-list="notifications"]');
  renderPaginatedList(notificationList, notifications, (notification) => {
    const item = makeDashboardListItem(
      notification.title,
      `${formatDate(notification.created_at)} · ${notification.body}`
    );
    if (!notification.read_at) {
      item.classList.add("notification-unread");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dashboard-text-button";
      button.dataset.notificationRead = notification.id;
      button.textContent = "Mark read";
      item.append(button);
    }
    return item;
  }, "You have no notifications yet.");

  const memberList = document.querySelector('[data-dashboard-list="members"]');
  renderPaginatedList(memberList, members, (member) => {
    const row = document.createElement("div");
    row.className = "member-table-row";
    row.setAttribute("role", "row");
    const name = document.createElement("span");
    name.setAttribute("role", "cell");
    name.textContent = member.full_name || "Vyro member";
    const since = document.createElement("span");
    since.setAttribute("role", "cell");
    since.textContent = formatDate(member.created_at);
    const status = document.createElement("span");
    status.setAttribute("role", "cell");
    const badge = document.createElement("span");
    badge.className = "member-status";
    badge.textContent = "Approved";
    status.append(badge);
    row.append(name, since, status);
    return row;
  }, "No approved members were found.");

  const savingsList = document.querySelector('[data-dashboard-list="savings"]');
  renderPaginatedList(savingsList, savings, (entry) => {
    const isWithdrawal = entry.entry_type === "withdrawal";
    const title = isWithdrawal ? "Withdrawal" : "Savings contribution";
    const detail = [formatDate(entry.occurred_at), entry.description].filter(Boolean).join(" · ");
    const amount = `${isWithdrawal ? "−" : "+"}${formatCurrency(entry.amount, currency)}`;
    const item = makeDashboardListItem(title, detail, amount);
    item.classList.add("savings-activity-item", isWithdrawal ? "savings-entry-withdrawal" : "savings-entry-contribution");
    return item;
  }, "No savings transactions have been recorded for your account.");

  const loansList = document.querySelector('[data-dashboard-list="loans"]');
  renderPaginatedList(loansList, loans, (loan) => {
    const balance = Math.max(0, Number(loan.principal) - (repaymentTotals.get(loan.id) || 0));
    const recordedBalance = scheduledBalances.has(loan.id)
      ? Math.max(0, scheduledBalances.get(loan.id))
      : balance;
    const detail = [
      `Status: ${loan.status}`,
      `Requested ${formatDate(loan.created_at)}`,
      `Due ${formatDate(loan.due_date)}`,
      loan.purpose,
    ].filter(Boolean).join(" · ");
    const item = makeDashboardListItem(
      `Loan · ${formatCurrency(loan.principal, currency)}`,
      detail,
      `${formatCurrency(recordedBalance, currency)} due`
    );
    if (["approved", "active"].includes(loan.status)) {
      const agreementButton = document.createElement("button");
      agreementButton.type = "button";
      agreementButton.className = "dashboard-text-button loan-agreement-button";
      agreementButton.dataset.loanAgreement = loan.id;
      agreementButton.textContent = "Print loan agreement";
      item.append(agreementButton);
    }
    return item;
  }, "There are no loan records linked to your member account.");

  const scheduleList = document.querySelector('[data-dashboard-list="repayment-schedule"]');
  renderPaginatedList(scheduleList, repaymentSchedule, (installment) => {
    const loan = loans.find((item) => item.id === installment.loan_id);
    const paid = Number(installment.paid_amount) || 0;
    const due = Number(installment.amount) || 0;
    return makeDashboardListItem(
      `Installment ${installment.installment_number} · ${loan?.purpose || "Loan"}`,
      `Due ${formatDate(installment.due_date)} · ${paid >= due ? "Paid" : `${formatCurrency(due - paid, currency)} remaining`}`,
      formatCurrency(due, currency)
    );
  }, "Repayment schedules will appear for loans approved with a schedule.");
  const repaymentHistory = document.querySelector('[data-dashboard-list="repayment-history"]');
  renderPaginatedList(repaymentHistory, repayments, (repayment) => {
    const loan = loans.find((item) => item.id === repayment.loan_id);
    const item = makeDashboardListItem(
      `Payment · ${loan?.purpose || "Loan"}`,
      `${formatDate(repayment.paid_at)}${repayment.note ? ` · ${repayment.note}` : ""}`,
      formatCurrency(repayment.amount, currency)
    );
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-text-button";
    button.dataset.repaymentReceipt = repayment.id;
    button.textContent = "Download receipt";
    const printButton = document.createElement("button");
    printButton.type = "button";
    printButton.className = "dashboard-text-button";
    printButton.dataset.printReceipt = repayment.id;
    printButton.textContent = "Print receipt";
    item.append(button, printButton);
    return item;
  }, "Recorded loan repayments will appear here.");
  const memberPaymentsList = document.querySelector('[data-dashboard-list="mpesa-payments"]');
  renderPaginatedList(memberPaymentsList, paymentRecords, (payment) => {
    const typeLabel = payment.payment_type === "loan_repayment" ? "Loan repayment" : "Savings contribution";
    const reference = payment.manual_reference
      || payment.mpesa_receipt_number
      || payment.account_reference
      || "Reference pending";
    const details = [
      formatDate(payment.created_at),
      payment.source === "manual" ? "Manual reference" : "STK prompt",
      `Ref: ${reference}`,
      payment.result_description,
      payment.review_note,
    ].filter(Boolean).join(" · ");
    const item = makeDashboardListItem(
      `${typeLabel} · ${formatCurrency(payment.amount, currency)}`,
      details,
      payment.status.replaceAll("_", " ")
    );
    item.classList.add("member-payment-item", `member-payment-status-${payment.status}`);
    return item;
  }, "No M-Pesa payments have been submitted.");
  const withdrawalRequestsList = document.querySelector('[data-dashboard-list="withdrawal-requests"]');
  renderPaginatedList(withdrawalRequestsList, withdrawalRequests, (request) => {
    const details = [
      formatDate(request.created_at),
      request.reason,
      request.admin_note,
    ].filter(Boolean).join(" · ");
    const item = makeDashboardListItem(
      `Withdrawal request · ${formatCurrency(request.amount, currency)}`,
      details,
      request.status
    );
    item.classList.add("withdrawal-request-item", `withdrawal-request-status-${request.status}`);
    return item;
  }, "You have not submitted any withdrawal requests.");

  updateLoanEligibility(loanEligibility);
  const requestList = document.querySelector('[data-dashboard-list="loan-requests"]');
  renderPaginatedList(requestList, loanRequests, (request) => {
    const requestGuarantees = sentGuarantees.filter((guarantee) => guarantee.request_id === request.id);
    const guaranteeSummary = requestGuarantees.length
      ? `Guarantors: ${requestGuarantees.map((guarantee) => {
        const guarantor = members.find((member) => member.id === guarantee.guarantor_id);
        const name = guarantor?.full_name || "Group member";
        return `${name} (${guarantee.status})`;
      }).join(", ")}`
      : request.status === "awaiting_guarantors"
        ? "Choose two approved members as guarantors."
        : "";
    const requestDetail = [
      request.purpose,
      `Submitted ${formatDate(request.created_at)}`,
      request.reviewed_at ? `Reviewed ${formatDate(request.reviewed_at)}` : "",
      request.admin_note || "",
      guaranteeSummary,
    ].filter(Boolean).join(" · ");
    const item = makeDashboardListItem(
      `Request · ${formatCurrency(request.requested_amount, currency)}`,
      requestDetail,
      request.status === "pending"
        ? "Awaiting admin review"
        : request.status === "awaiting_guarantors"
          ? "Awaiting guarantors"
          : request.status
    );
    if (
      request.status === "awaiting_guarantors"
      && requestGuarantees.some((guarantee) => guarantee.status === "declined")
    ) {
      const replaceButton = document.createElement("button");
      replaceButton.type = "button";
      replaceButton.className = "guarantor-action";
      replaceButton.dataset.replaceGuarantors = request.id;
      replaceButton.textContent = "Choose two replacements";
      item.classList.add("guarantor-list-item");
      item.append(replaceButton);
    }
    return item;
  }, "You have not submitted a loan request.");

  const activeGuarantorRequest = loanRequests.find((request) => {
    if (request.status !== "awaiting_guarantors") {
      return false;
    }
    const requestGuarantees = sentGuarantees.filter((guarantee) => guarantee.request_id === request.id);
    return requestGuarantees.length === 0
      || requestGuarantees.some((guarantee) => guarantee.status === "declined");
  });
  if (guarantorPanel) {
    guarantorPanel.hidden = !activeGuarantorRequest;
    if (activeGuarantorRequest) {
      guarantorForm.dataset.requestId = activeGuarantorRequest.id;
      guarantorOne.value = "";
      guarantorTwo.value = "";
      populateGuarantorSelect(guarantorOne, members, user.id);
      populateGuarantorSelect(guarantorTwo, members, user.id);
      if (guarantorMessage) {
        guarantorMessage.textContent = sentGuarantees.some((guarantee) =>
          guarantee.request_id === activeGuarantorRequest.id && guarantee.status === "declined"
        )
          ? "A selected member declined. Please choose two group members again; they will both be asked to confirm."
          : "Choose two different approved group members. They must accept before your application reaches the administrator.";
      }
    }
  }

  const incomingList = document.querySelector('[data-dashboard-list="incoming-guarantees"]');
  renderPaginatedList(incomingList, receivedGuarantees, (guarantee) => {
    const request = receivedRequests.find((item) => item.id === guarantee.request_id);
    const borrower = members.find((member) => member.id === request?.member_id);
    const detail = request
      ? `${request.purpose} · Requested ${formatDate(request.created_at)}`
      : "Loan details unavailable";
    const item = makeDashboardListItem(
      `Guarantor request from ${borrower?.full_name || "a group member"}`,
      detail,
      request ? formatCurrency(request.requested_amount, currency) : ""
    );
    if (guarantee.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "guarantor-action-row";
      for (const [response, label] of [["accept", "Accept"], ["decline", "Decline"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `guarantor-action${response === "decline" ? " decline" : ""}`;
        button.dataset.guaranteeResponse = response;
        button.dataset.requestId = guarantee.request_id;
        button.textContent = response === "accept" ? "Accept guarantor role" : label;
        actions.append(button);
      }
      item.classList.add("guarantor-list-item");
      item.append(actions);
    } else {
      const state = document.createElement("span");
      state.className = "dashboard-list-amount";
      state.textContent = `You ${guarantee.status}`;
      item.append(state);
    }
    return item;
  }, "There are no guarantor requests for you.");

  const recentActivity = document.querySelector('[data-dashboard-list="recent-activity"]');
  const activityItems = [
    ...savings.map((entry) => ({
      date: entry.occurred_at,
      title: entry.entry_type === "withdrawal" ? "Savings withdrawal" : "Savings contribution",
      detail: formatDate(entry.occurred_at),
      amount: `${entry.entry_type === "withdrawal" ? "−" : "+"}${formatCurrency(entry.amount, currency)}`,
    })),
    ...loans.map((loan) => ({
      date: loan.created_at,
      title: `Loan ${loan.status}`,
      detail: formatDate(loan.created_at),
      amount: formatCurrency(loan.principal, currency),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  if (activityItems.length === 0) {
    showEmptyState(recentActivity, "Your savings and loan activity will appear here when recorded.");
  } else {
    recentActivity.replaceChildren(...activityItems.map((item) =>
      makeDashboardListItem(item.title, item.detail, item.amount)
    ));
  }

  const updatesList = document.querySelector('[data-dashboard-list="updates"]');
  const recentUpdates = document.querySelector('[data-dashboard-list="recent-updates"]');
  const makeAnnouncement = (announcement, compact = false) => {
    const article = document.createElement(compact ? "li" : "article");
    article.className = compact ? "dashboard-list-item" : "dashboard-update-card";
    const heading = document.createElement("strong");
    heading.textContent = announcement.title;
    const date = document.createElement("small");
    date.textContent = formatDate(announcement.published_at);
    const body = document.createElement("p");
    body.textContent = announcement.body;
    article.append(heading, date, body);
    return article;
  };
  if (announcements.length === 0) {
    showEmptyState(recentUpdates, "There are no new group announcements.");
  } else {
    recentUpdates.replaceChildren(...announcements.slice(0, 3).map((announcement) => makeAnnouncement(announcement, true)));
  }
  renderPaginatedList(updatesList, announcements, (announcement) => makeAnnouncement(announcement), "There are no group announcements yet.");

  if (dashboardMessage) {
    dashboardMessage.textContent = "";
    dashboardMessage.hidden = true;
  }
}

async function loadDashboard(user, profile) {
  if (dashboardMessage) {
    dashboardMessage.hidden = false;
    dashboardMessage.textContent = "Loading your group dashboard…";
  }
  const { error: dueNotificationError } = await supabase.rpc("create_member_due_notifications");
  if (dueNotificationError) {
    throw new Error(`Could not check for upcoming loan installments: ${dueNotificationError.message}`);
  }

  const [
    summaryResult,
    membersResult,
    savingsResult,
    loansResult,
    announcementsResult,
    eligibilityResult,
    loanRequestsResult,
    transparencyResult,
    notificationsResult,
    paymentRecordsResult,
    withdrawalRequestsResult,
  ] =
    await Promise.all([
      supabase.rpc("get_member_group_summary"),
      fetchAllRowsResult(supabase
        .from("member_profiles")
        .select("id, full_name, status, created_at, approved_at")
        .eq("status", "approved")
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })),
      fetchAllRowsResult(supabase
        .from("savings_transactions")
        .select("id, amount, entry_type, description, occurred_at")
        .eq("member_id", user.id)
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: true })),
      fetchAllRowsResult(supabase
        .from("loans")
        .select("id, request_id, principal, status, purpose, due_date, created_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })),
      fetchAllRowsResult(supabase
        .from("group_announcements")
        .select("id, title, body, published_at")
        .order("published_at", { ascending: false })
        .order("id", { ascending: true })),
      supabase.rpc("get_member_loan_eligibility"),
      fetchAllRowsResult(supabase
        .from("loan_requests")
        .select("id, member_id, requested_amount, purpose, status, admin_note, created_at, reviewed_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })),
      supabase.rpc("get_group_transparency"),
      fetchAllRowsResult(supabase
        .from("member_notifications")
        .select("id, notification_type, title, body, created_at, read_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })),
      fetchAllRowsResult(supabase
        .from("mpesa_payment_records")
        .select("id, payment_type, loan_id, source, amount, account_reference, manual_reference, mpesa_receipt_number, status, result_description, review_note, created_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })),
      fetchAllRowsResult(supabase
        .from("savings_withdrawal_requests")
        .select("id, amount, reason, status, admin_note, created_at, reviewed_at")
        .eq("member_id", user.id)
        .order("created_at", { ascending: false })),
    ]);

  const failed = [
    summaryResult,
    membersResult,
    savingsResult,
    loansResult,
    announcementsResult,
    eligibilityResult,
    loanRequestsResult,
    transparencyResult,
    notificationsResult,
    paymentRecordsResult,
    withdrawalRequestsResult,
  ].find((result) => result.error);
  if (failed?.error) {
    throw new Error(
      `Could not load group dashboard data: ${failed.error.message}. Confirm the latest Supabase dashboard SQL setup has been run.`
    );
  }

  const loans = loansResult.data || [];
  const loanRequests = loanRequestsResult.data || [];
  const [sentGuaranteesResult, receivedGuaranteesResult] = await Promise.all([
    loanRequests.length > 0
      ? fetchAllRowsResult(supabase
        .from("loan_request_guarantors")
        .select("request_id, guarantor_id, status, responded_at")
        .in("request_id", loanRequests.map((request) => request.id))
        .order("request_id", { ascending: true })
        .order("guarantor_id", { ascending: true }))
      : Promise.resolve({ data: [], error: null }),
    fetchAllRowsResult(supabase
      .from("loan_request_guarantors")
      .select("request_id, guarantor_id, status, responded_at")
      .eq("guarantor_id", user.id)
      .order("created_at", { ascending: false })
      .order("request_id", { ascending: true })),
  ]);
  if (sentGuaranteesResult.error || receivedGuaranteesResult.error) {
    const error = sentGuaranteesResult.error || receivedGuaranteesResult.error;
    throw new Error(`Could not load guarantor requests: ${error.message}`);
  }
  const receivedGuarantees = receivedGuaranteesResult.data || [];
  let receivedRequests = [];
  if (receivedGuarantees.length > 0) {
    const receivedRequestsResult = await fetchAllRowsResult(supabase
      .from("loan_requests")
      .select("id, member_id, requested_amount, purpose, status, created_at")
      .in("id", receivedGuarantees.map((guarantee) => guarantee.request_id))
      .order("id", { ascending: true }));
    if (receivedRequestsResult.error) {
      throw new Error(`Could not load loan requests requiring your guarantee: ${receivedRequestsResult.error.message}`);
    }
    receivedRequests = receivedRequestsResult.data || [];
  }
  let repayments = [];
  let repaymentSchedule = [];
  if (loans.length > 0) {
    const repaymentsResult = await fetchAllRowsResult(supabase
      .from("loan_repayments")
      .select("id, loan_id, amount, note, paid_at")
      .in("loan_id", loans.map((loan) => loan.id))
      .order("paid_at", { ascending: false })
      .order("id", { ascending: true }));
    if (repaymentsResult.error) {
      throw new Error(`Could not load your loan repayments: ${repaymentsResult.error.message}`);
    }
    repayments = repaymentsResult.data || [];
    const scheduleResult = await fetchAllRowsResult(supabase
      .from("loan_repayment_schedule")
      .select("id, loan_id, installment_number, due_date, amount, paid_amount, paid_at")
      .in("loan_id", loans.map((loan) => loan.id))
      .order("due_date", { ascending: true })
      .order("loan_id", { ascending: true })
      .order("installment_number", { ascending: true }));
    if (scheduleResult.error) {
      throw new Error(`Could not load your repayment schedule: ${scheduleResult.error.message}`);
    }
    repaymentSchedule = scheduleResult.data || [];
  }

  renderDashboard({
    user,
    profile,
    summary: summaryResult.data || [],
    members: membersResult.data || [],
    savings: savingsResult.data || [],
    loans,
    repayments,
    repaymentSchedule,
    notifications: notificationsResult.data || [],
    announcements: announcementsResult.data || [],
    eligibility: eligibilityResult.data || [],
    loanRequests,
    sentGuarantees: sentGuaranteesResult.data || [],
    receivedGuarantees,
    receivedRequests,
    transparency: transparencyResult.data || [],
    paymentRecords: paymentRecordsResult.data || [],
    withdrawalRequests: withdrawalRequestsResult.data || [],
  });
}

function showPortalForm(name) {
  hideEmailCodeForms();
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = false;
  });
  portalTabs.forEach((tab) => {
    const isActive = tab.dataset.portalTab === name;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  portalForms.forEach((form) => {
    form.hidden = form.dataset.portalForm !== name;
  });
  if (recoveryForm) {
    recoveryForm.hidden = true;
  }

  if (portalAccount) {
    portalAccount.hidden = true;
  }
  if (portalNotice) {
    portalNotice.hidden = false;
  }

  if (portalTitle && portalIntro) {
    const isLogin = name === "login";
    portalTitle.textContent = isLogin ? "Welcome back" : "Create your account";
    portalIntro.textContent = isLogin
      ? "Sign in to your account or request to join the member portal."
      : "Enter your details to request access to the Vyro member portal.";
  }

  setPortalMessage("");
}

async function showMemberAccount(user, profile) {
  activeMember = user;
  activeMemberProfile = profile;
  hideEmailCodeForms();
  if (loanRequestResult) {
    loanRequestResult.textContent = "";
  }
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = true;
  });
  portalForms.forEach((form) => {
    form.hidden = true;
  });
  if (recoveryForm) {
    recoveryForm.hidden = true;
  }
  if (portalAccount) {
    portalAccount.hidden = false;
  }
  if (portalNotice) {
    portalNotice.hidden = true;
  }
  if (portalAccountEmail) {
    portalAccountEmail.textContent = user.email || "";
  }
  if (portalAccountName) {
    portalAccountName.textContent =
      profile.full_name || user.user_metadata?.full_name || "Vyro member";
  }
  if (portalTitle) {
    portalTitle.textContent = "Member dashboard";
  }
  if (portalIntro) {
    portalIntro.textContent = "Your group, savings, loan and member information.";
  }
  setDashboardView("overview");
  setPortalMessage("");
  try {
    await loadDashboard(user, profile);
  } catch (error) {
    if (dashboardMessage) {
      dashboardMessage.hidden = false;
      dashboardMessage.textContent =
        error instanceof Error ? error.message : "Unable to load dashboard data.";
    }
  }
}

async function clearSession() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(`Could not safely end the session: ${error.message}`);
  }
}

async function checkMemberApproval(user) {
  const { data, error } = await supabase.rpc("get_my_member_profile");
  const profile = data?.[0];

  if (error) {
    await clearSession();
    setPortalMessage(
      "We could not verify your member approval. Please contact the group administrator."
    );
    return false;
  }

  if (!profile) {
    await clearSession();
    setPortalMessage(
      "No member approval record was found. Please contact the group administrator."
    );
    return false;
  }

  if (profile.status !== "approved") {
    await clearSession();
    setPortalMessage(
      profile.status === "suspended"
        ? "Your member portal access is suspended. Please contact the group administrator."
        : profile.status === "rejected"
          ? "This member access request was not approved. Please contact the group."
          : "Your request is awaiting group approval. You cannot sign in until it is approved."
    );
    return false;
  }

  await showMemberAccount(user, profile);
  return true;
}

function showPasswordRecovery() {
  if (!(portalDialog instanceof HTMLDialogElement) || !recoveryForm) {
    return;
  }
  if (!portalDialog.open) {
    portalDialog.showModal();
  }
  hideEmailCodeForms();
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = true;
  });
  portalForms.forEach((form) => {
    form.hidden = true;
  });
  if (portalAccount) {
    portalAccount.hidden = true;
  }
  if (portalNotice) {
    portalNotice.hidden = true;
  }
  recoveryForm.hidden = false;
  portalTitle.textContent = "Choose a new password";
  portalIntro.textContent = "Set a new password for your Vyro member account.";
  setPortalMessage("");
  recoveryForm.querySelector("input").focus();
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    showPasswordRecovery();
  }
});

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadRepaymentReceipt(repaymentId) {
  const repayment = currentStatementData?.repayments.find((item) => item.id === repaymentId);
  if (!repayment) {
    setPortalMessage("This repayment receipt is not available in the current dashboard data.");
    return;
  }
  const loan = currentStatementData.loans.find((item) => item.id === repayment.loan_id);
  const receipt = [
    ["Vyro Self Help Group", "Loan repayment receipt"],
    ["Receipt reference", repayment.id],
    ["Member", activeMemberProfile?.full_name || activeMember?.user_metadata?.full_name || "Vyro member"],
    ["Loan purpose", loan?.purpose || "Loan"],
    ["Date recorded", formatDate(repayment.paid_at)],
    ["Amount", `${currentStatementData.currency} ${Number(repayment.amount).toFixed(2)}`],
    ["Note", repayment.note || ""],
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${receipt}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `vyro-repayment-receipt-${repayment.id}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openPrintWindow() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setPortalMessage("Allow pop-ups for this site to open a printable copy.");
    return null;
  }
  return printWindow;
}

function renderPrintDocument(printWindow, title, description, headers, rows) {
  if (printWindow.closed) {
    setPortalMessage("The print window was closed before the document was ready.");
    return false;
  }

  const printDocument = printWindow.document;
  printDocument.open();
  printDocument.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Vyro Chama</title>
        <style>
          * { box-sizing: border-box; }
          body { max-width: 900px; margin: 40px auto; padding: 0 24px; color: #17204f; font: 14px/1.5 Arial, sans-serif; }
          header { margin-bottom: 24px; padding-bottom: 18px; border-bottom: 3px solid #1855d8; }
          .brand { margin: 0; color: #182b83; font-size: 15px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
          h1 { margin: 14px 0 4px; font-size: 26px; }
          .description { color: #526087; font-size: 12px; }
          .print-button { margin: 0 0 18px; padding: 9px 14px; border: 0; border-radius: 6px; background: #1855d8; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px 9px; border-bottom: 1px solid #dfe4f1; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
          th { background: #edf1ff; color: #273b8d; font-size: 11px; }
          td { font-size: 12px; }
          footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #dfe4f1; color: #637096; font-size: 10px; }
          @media print { body { margin: 0 auto; padding: 0; } .print-button { display: none; } }
        </style>
      </head>
      <body></body>
    </html>`);
  printDocument.close();
  printDocument.title = `Vyro Chama | ${title}`;

  const header = printDocument.createElement("header");
  const brand = printDocument.createElement("p");
  brand.className = "brand";
  brand.textContent = "Vyro Chama";
  const heading = printDocument.createElement("h1");
  heading.textContent = title;
  const detail = printDocument.createElement("p");
  detail.className = "description";
  detail.textContent = description;
  header.append(brand, heading, detail);

  const printButton = printDocument.createElement("button");
  printButton.className = "print-button";
  printButton.type = "button";
  printButton.textContent = "Print or save as PDF";
  printButton.addEventListener("click", () => printWindow.print());

  const table = printDocument.createElement("table");
  const tableHead = printDocument.createElement("thead");
  const headerRow = printDocument.createElement("tr");
  headers.forEach((text) => {
    const cell = printDocument.createElement("th");
    cell.textContent = text;
    headerRow.append(cell);
  });
  tableHead.append(headerRow);
  const tableBody = printDocument.createElement("tbody");
  if (rows.length === 0) {
    const row = printDocument.createElement("tr");
    const cell = printDocument.createElement("td");
    cell.colSpan = headers.length;
    cell.textContent = "No records for the selected period.";
    row.append(cell);
    tableBody.append(row);
  } else {
    rows.forEach((values) => {
      const row = printDocument.createElement("tr");
      values.forEach((text) => {
        const cell = printDocument.createElement("td");
        cell.textContent = String(text ?? "");
        row.append(cell);
      });
      tableBody.append(row);
    });
  }
  table.append(tableHead, tableBody);

  const footer = printDocument.createElement("footer");
  footer.textContent = "Generated from Vyro Chama member portal records. Contact the group administrator if you notice an error.";
  printDocument.body.replaceChildren(header, printButton, table, footer);
  printWindow.focus();
  window.setTimeout(() => {
    if (!printWindow.closed) {
      printWindow.print();
    }
  }, 250);
  return true;
}

function printLoanAgreement(loanId) {
  const loan = currentStatementData?.loans.find((item) => item.id === loanId);
  if (!loan || !["approved", "active"].includes(loan.status)) {
    setPortalMessage("This loan agreement is not available for a loan approved by the group.");
    return;
  }
  const installments = currentStatementData.repaymentSchedule
    .filter((item) => item.loan_id === loan.id)
    .sort((left, right) => left.installment_number - right.installment_number);
  if (installments.length === 0) {
    setPortalMessage("The approved loan does not have a recorded repayment schedule yet. Contact the group administrator.");
    return;
  }
  const linkedRequest = loan.request_id
    ? currentStatementData.loanRequests.find((request) => request.id === loan.request_id)
    : currentStatementData.loanRequests
      .filter((request) =>
        request.status === "approved"
        && Number(request.requested_amount) === Number(loan.principal)
        && request.purpose === loan.purpose
      )
      .sort((left, right) =>
        Math.abs(new Date(left.reviewed_at || left.created_at).getTime() - new Date(loan.created_at).getTime())
        - Math.abs(new Date(right.reviewed_at || right.created_at).getTime() - new Date(loan.created_at).getTime())
      )[0];
  const guarantorNames = linkedRequest
    ? currentStatementData.sentGuarantees
      .filter((guarantee) => guarantee.request_id === linkedRequest.id && guarantee.status === "accepted")
      .map((guarantee) => currentStatementData.groupMembers
        .find((member) => member.id === guarantee.guarantor_id)?.full_name)
      .filter(Boolean)
    : [];
  if (guarantorNames.length !== 2) {
    setPortalMessage("Both guarantor names could not be verified for this loan. Contact the group administrator before printing the agreement.");
    return;
  }
  const guarantorLabel = guarantorNames.join(", ");

  const printWindow = openPrintWindow();
  if (!printWindow || printWindow.closed) {
    return;
  }
  const printDocument = printWindow.document;
  printDocument.open();
  printDocument.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Vyro Chama | Loan Agreement</title>
        <style>
          * { box-sizing: border-box; }
          body { max-width: 820px; margin: 32px auto; padding: 0 24px; color: #17204f; font: 13px/1.55 Arial, sans-serif; }
          header { display: flex; align-items: center; gap: 20px; margin-bottom: 22px; padding-bottom: 16px; border-bottom: 3px solid #1855d8; }
          .logo { display: block; width: 150px; height: auto; }
          .heading-copy { min-width: 0; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          .subtitle { margin: 0; color: #526087; font-size: 12px; }
          .print-button { margin: 0 0 18px; padding: 9px 14px; border: 0; border-radius: 6px; background: #1855d8; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
          h2 { margin: 20px 0 8px; color: #273b8d; font-size: 15px; }
          .loan-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 20px; margin: 0; padding: 15px; border: 1px solid #dfe4f1; border-radius: 8px; }
          .loan-details div { min-width: 0; }
          dt { color: #637096; font-size: 10px; font-weight: 700; text-transform: uppercase; }
          dd { margin: 3px 0 0; overflow-wrap: anywhere; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 8px; border-bottom: 1px solid #dfe4f1; text-align: left; }
          th { background: #edf1ff; color: #273b8d; font-size: 10px; }
          td { font-size: 11px; }
          .terms { margin: 0; padding-left: 20px; }
          .terms li { margin: 6px 0; }
          .acknowledgment { margin-top: 16px; padding: 12px; border-left: 3px solid #1855d8; background: #f3f5fc; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 34px 28px; margin-top: 42px; }
          .signature { min-height: 48px; padding-top: 20px; border-top: 1px solid #536080; }
          .signature strong, .signature span { display: block; font-size: 11px; }
          .signature span { margin-top: 3px; color: #637096; }
          footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #dfe4f1; color: #637096; font-size: 9px; }
          @media (max-width: 540px) { body { margin: 18px auto; padding: 0 14px; } header { align-items: flex-start; flex-direction: column; gap: 10px; } .logo { width: 125px; } .loan-details, .signatures { grid-template-columns: 1fr; } }
          @media print { body { margin: 0 auto; padding: 0; } .print-button { display: none; } header, .loan-details, table, .terms, .acknowledgment, .signatures { break-inside: avoid; } }
        </style>
      </head>
      <body></body>
    </html>`);
  printDocument.close();

  const header = printDocument.createElement("header");
  const logo = printDocument.createElement("img");
  logo.className = "logo";
  logo.src = new URL("assets/vyro-chama-logo.png", window.location.href).href;
  logo.alt = "Vyro Chama — Save Together. Achieve More.";
  const headingCopy = printDocument.createElement("div");
  headingCopy.className = "heading-copy";
  const heading = printDocument.createElement("h1");
  heading.textContent = "Loan Agreement";
  const subtitle = printDocument.createElement("p");
  subtitle.className = "subtitle";
  subtitle.textContent = "Approved loan terms and member acceptance";
  headingCopy.append(heading, subtitle);
  header.append(logo, headingCopy);

  const printButton = printDocument.createElement("button");
  printButton.className = "print-button";
  printButton.type = "button";
  printButton.textContent = "Print or save as PDF";
  printButton.addEventListener("click", () => printWindow.print());

  const detailsTitle = printDocument.createElement("h2");
  detailsTitle.textContent = "Member and loan details";
  const details = printDocument.createElement("dl");
  details.className = "loan-details";
  const detailRows = [
    ["Member name", activeMemberProfile?.full_name || activeMember?.user_metadata?.full_name || "Not recorded"],
    ["Mobile number", activeMemberProfile?.phone || activeMember?.user_metadata?.phone || "Not recorded"],
    ["Loan reference", loan.id],
    ["Loan purpose", loan.purpose || "Not specified"],
    ["Guarantors", guarantorLabel],
    ["Approved loan amount", formatCurrency(loan.principal, currentStatementData.currency)],
    ["Total repayment amount", formatCurrency(
      installments.reduce((total, installment) => total + Number(installment.amount), 0),
      currentStatementData.currency
    )],
  ];
  detailRows.forEach(([label, value]) => {
    const pair = printDocument.createElement("div");
    const term = printDocument.createElement("dt");
    term.textContent = label;
    const description = printDocument.createElement("dd");
    description.textContent = value;
    pair.append(term, description);
    details.append(pair);
  });

  const scheduleTitle = printDocument.createElement("h2");
  scheduleTitle.textContent = "Repayment schedule";
  const table = printDocument.createElement("table");
  const tableHead = printDocument.createElement("thead");
  const headerRow = printDocument.createElement("tr");
  ["Installment", "Due date", `Amount (${currentStatementData.currency})`].forEach((label) => {
    const cell = printDocument.createElement("th");
    cell.textContent = label;
    headerRow.append(cell);
  });
  tableHead.append(headerRow);
  const tableBody = printDocument.createElement("tbody");
  installments.forEach((installment) => {
    const row = printDocument.createElement("tr");
    [
      String(installment.installment_number),
      formatDate(installment.due_date),
      formatCurrency(installment.amount, currentStatementData.currency),
    ].forEach((value) => {
      const cell = printDocument.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    tableBody.append(row);
  });
  table.append(tableHead, tableBody);

  const termsTitle = printDocument.createElement("h2");
  termsTitle.textContent = "Terms and conditions";
  const terms = printDocument.createElement("ol");
  terms.className = "terms";
  [
    "The group approves the loan principal stated in this agreement, subject to the group’s disbursement process.",
    "The member agrees to repay the total amount shown above in the installments and by the due dates in the repayment schedule.",
    "The member should retain payment receipts and promptly notify the group administrator of any discrepancy or difficulty meeting a due date.",
    "Any change to the repayment amount or schedule, and any interest, fee, or late-payment consequence, must be disclosed and agreed in writing by both parties before it applies.",
    "This agreement records the approved loan terms. The member should read and ask questions about the terms before signing; both parties should keep a signed copy.",
  ].forEach((text) => {
    const item = printDocument.createElement("li");
    item.textContent = text;
    terms.append(item);
  });

  const acknowledgment = printDocument.createElement("p");
  acknowledgment.className = "acknowledgment";
  acknowledgment.textContent = "By signing below, the member confirms that the details and repayment schedule have been reviewed, understood, and accepted.";

  const signatures = printDocument.createElement("section");
  signatures.className = "signatures";
  [
    ["Member signature", activeMemberProfile?.full_name || activeMember?.user_metadata?.full_name || "Member"],
    ["Date signed", ""],
    ["Guarantor 1 signature", guarantorNames[0] || "Guarantor"],
    ["Date signed", ""],
    ["Guarantor 2 signature", guarantorNames[1] || "Guarantor"],
    ["Date signed", ""],
    ["Group representative signature", "Name and role"],
    ["Date signed", ""],
  ].forEach(([label, detail]) => {
    const line = printDocument.createElement("div");
    line.className = "signature";
    const name = printDocument.createElement("strong");
    name.textContent = label;
    const caption = printDocument.createElement("span");
    caption.textContent = detail;
    line.append(name, caption);
    signatures.append(line);
  });

  const footer = printDocument.createElement("footer");
  footer.textContent = `Vyro Chama · Agreement generated ${formatDate(new Date().toISOString())}. This document reflects the loan and repayment schedule currently recorded in the member portal.`;
  printDocument.body.replaceChildren(
    header, printButton, detailsTitle, details, scheduleTitle, table,
    termsTitle, terms, acknowledgment, signatures, footer
  );
  printWindow.focus();
  window.setTimeout(() => {
    if (!printWindow.closed) {
      printWindow.print();
    }
  }, 250);
  setPortalMessage("Your approved loan agreement is ready to print or save as PDF for signing.");
}

function printRepaymentReceipt(repaymentId) {
  const repayment = currentStatementData?.repayments.find((item) => item.id === repaymentId);
  if (!repayment) {
    setPortalMessage("This repayment receipt is not available in the current dashboard data.");
    return;
  }
  const printWindow = openPrintWindow();
  if (!printWindow) {
    return;
  }
  const loan = currentStatementData.loans.find((item) => item.id === repayment.loan_id);
  const details = [
    ["Receipt reference", repayment.id],
    ["Member", activeMemberProfile?.full_name || activeMember?.user_metadata?.full_name || "Vyro member"],
    ["Loan purpose", loan?.purpose || "Loan"],
    ["Date recorded", formatDate(repayment.paid_at)],
    ["Amount", `${currentStatementData.currency} ${Number(repayment.amount).toFixed(2)}`],
    ["Note", repayment.note || "—"],
  ];
  if (renderPrintDocument(printWindow, "Loan repayment receipt", "Payment record", ["Item", "Details"], details)) {
    setPortalMessage("Printable repayment receipt opened.");
  }
}

async function fetchAllRows(query) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) {
      return rows;
    }
  }
}

async function fetchAllRowsResult(query) {
  try {
    return { data: await fetchAllRows(query), error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "The request failed." },
    };
  }
}

async function exportMemberStatement(forPrint = false) {
  if (!currentStatementData) {
    setPortalMessage("Statement data is not available. Refresh the dashboard and try again.");
    return;
  }
  const { currency } = currentStatementData;
  const from = document.querySelector("#statement-from").value;
  const to = document.querySelector("#statement-to").value;
  if (from && to && from > to) {
    setPortalMessage("The statement start date must be on or before the end date.");
    return;
  }

  const button = document.querySelector(forPrint ? "[data-print-statement]" : "[data-download-statement]");
  const printWindow = forPrint ? openPrintWindow() : null;
  if (forPrint && !printWindow) {
    return;
  }
  button.disabled = true;
  setPortalMessage("Preparing your statement…");
  let savings;
  let loans;
  let repayments = [];
  let repaymentSchedule = [];
  try {
    [savings, loans] = await Promise.all([
      fetchAllRows(supabase
        .from("savings_transactions")
        .select("id, amount, entry_type, description, occurred_at")
        .eq("member_id", activeMember.id)
        .order("occurred_at", { ascending: true })),
      fetchAllRows(supabase
        .from("loans")
        .select("id, principal, status, purpose, created_at")
        .eq("member_id", activeMember.id)
        .order("created_at", { ascending: true })),
    ]);
    const loanIds = loans.map((loan) => loan.id);
    for (let start = 0; start < loanIds.length; start += 100) {
      const loanIdBatch = loanIds.slice(start, start + 100);
      const [repaymentRows, scheduleRows] = await Promise.all([
        fetchAllRows(supabase
          .from("loan_repayments")
          .select("id, loan_id, amount, note, paid_at")
          .in("loan_id", loanIdBatch)
          .order("paid_at", { ascending: true })),
        fetchAllRows(supabase
          .from("loan_repayment_schedule")
          .select("id, loan_id, installment_number, due_date, amount, paid_amount, paid_at")
          .in("loan_id", loanIdBatch)
          .order("due_date", { ascending: true })),
      ]);
      repayments.push(...repaymentRows);
      repaymentSchedule.push(...scheduleRows);
    }
  } catch (error) {
    if (printWindow && !printWindow.closed) {
      printWindow.close();
    }
    setPortalMessage(`Unable to prepare your statement: ${error.message}`);
    return;
  } finally {
    button.disabled = false;
  }

  const rows = [
    ...savings.map((item) => ({
      date: item.occurred_at,
      type: item.entry_type === "withdrawal" ? "Savings withdrawal" : "Savings contribution",
      details: item.description || "",
      amount: item.entry_type === "withdrawal" ? -Number(item.amount) : Number(item.amount),
    })),
    ...loans.map((item) => ({
      date: item.created_at,
      type: `Loan ${item.status}`,
      details: item.purpose || "",
      amount: Number(item.principal),
    })),
    ...repayments.map((item) => ({
      date: item.paid_at,
      type: "Loan repayment",
      details: item.note || "",
      amount: -Number(item.amount),
    })),
    ...repaymentSchedule.map((item) => ({
      date: item.due_date,
      type: "Scheduled installment",
      details: `Installment ${item.installment_number} · ${Number(item.paid_amount) >= Number(item.amount) ? "Paid" : "Due"}`,
      amount: Number(item.amount),
    })),
  ].filter((item) => {
    const day = String(item.date || "").slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  }).sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

  if (forPrint && printWindow) {
    const memberName = activeMemberProfile?.full_name || activeMember?.user_metadata?.full_name || "Vyro member";
    const period = `Member: ${memberName} · Period: ${from || "All dates"} to ${to || "Present"}`;
    const printableRows = rows.map((item) => [
      formatDate(item.date),
      item.type,
      item.details,
      `${item.amount < 0 ? "−" : ""}${currency} ${Math.abs(item.amount).toFixed(2)}`,
    ]);
    if (renderPrintDocument(
      printWindow,
      "Member account statement",
      period,
      ["Date", "Type", "Details", `Amount (${currency})`],
      printableRows
    )) {
      setPortalMessage(`${rows.length} statement records opened for printing or saving as PDF.`);
    }
    return;
  }

  const csv = [
    ["Date", "Type", "Details", `Amount (${currency})`],
    ...rows.map((item) => [formatDate(item.date), item.type, item.details, item.amount.toFixed(2)]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vyro-member-statement-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setPortalMessage(`${rows.length} statement records exported to CSV.`);
}

document.querySelectorAll("[data-portal-open]").forEach((trigger) => {
  trigger.addEventListener("click", () => runPortalAction(async () => {
    if (!(portalDialog instanceof HTMLDialogElement)) {
      return;
    }

    const portalMode = trigger.dataset.portalOpen === "signup" ? "signup" : "login";
    showPortalForm(portalMode);
    portalTabs.forEach((tab) => {
      tab.closest(".portal-tabs").hidden = false;
    });
    portalDialog.showModal();
    portalDialog.querySelector(portalMode === "signup" ? "#signup-name" : "#login-email").focus();

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setPortalMessage(`Could not check your session: ${error.message}`);
      return;
    }

    if (data.session) {
      await checkMemberApproval(data.session.user);
    }
  }));
});

portalTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    showPortalForm(tab.dataset.portalTab);
  });

  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const nextTab = tab.dataset.portalTab === "login" ? "signup" : "login";
    showPortalForm(nextTab);
    document.querySelector(`[data-portal-tab="${nextTab}"]`).focus();
  });
});

dashboardNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dashboard-view]");
  if (button) {
    setDashboardView(button.dataset.dashboardView);
  }
});

document.querySelectorAll("[data-dashboard-link]").forEach((button) => {
  button.addEventListener("click", () => {
    setDashboardView(button.dataset.dashboardLink);
  });
});

guarantorForm.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const firstGuarantorId = guarantorOne.value;
  const secondGuarantorId = guarantorTwo.value;
  if (!guarantorForm.dataset.requestId) {
    if (guarantorMessage) {
      guarantorMessage.textContent = "No loan request is waiting for guarantors.";
    }
    return;
  }
  if (!firstGuarantorId || !secondGuarantorId || firstGuarantorId === secondGuarantorId) {
    if (guarantorMessage) {
      guarantorMessage.textContent = "Choose two different group members.";
    }
    return;
  }

  const submitButton = guarantorForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  if (guarantorMessage) {
    guarantorMessage.textContent = "Sending both guarantor requests…";
  }
  try {
    const { error } = await supabase.rpc("select_loan_request_guarantors", {
      p_request_id: guarantorForm.dataset.requestId,
      p_first_guarantor_id: firstGuarantorId,
      p_second_guarantor_id: secondGuarantorId,
    });
    if (error) {
      if (guarantorMessage) {
        guarantorMessage.textContent = `Unable to send guarantor requests: ${error.message}`;
      }
      return;
    }
    if (guarantorMessage) {
      guarantorMessage.textContent = "Requests sent. Your loan application will reach the administrator after both members accept.";
    }
    await loadDashboard(activeMember, activeMemberProfile);
  } finally {
    submitButton.disabled = false;
  }
}));

document.querySelector('[data-dashboard-list="incoming-guarantees"]').addEventListener("click", (event) => runPortalAction(async () => {
  const button = event.target.closest("[data-guarantee-response]");
  if (!button) {
    return;
  }
  button.disabled = true;
  const { data, error } = await supabase.rpc("respond_to_loan_guarantee", {
    p_request_id: button.dataset.requestId,
    p_accept: button.dataset.guaranteeResponse === "accept",
  });
  if (error) {
    button.disabled = false;
    setPortalMessage(`Unable to record your response: ${error.message}`);
    return;
  }
  setPortalMessage(
    data === "pending"
      ? "You accepted. Both guarantors have accepted; the application is now with the group administrator."
      : button.dataset.guaranteeResponse === "accept"
        ? "You accepted the request. The other guarantor still needs to respond."
        : "You declined the request. The applicant will need to select guarantors again."
  );
  await loadDashboard(activeMember, activeMemberProfile);
}));

document.querySelector('[data-dashboard-list="loan-requests"]').addEventListener("click", (event) => {
  const button = event.target.closest("[data-replace-guarantors]");
  if (!button || !guarantorPanel) {
    return;
  }
  const request = currentLoanRequests.find((item) => item.id === button.dataset.replaceGuarantors);
  if (!request) {
    return;
  }
  guarantorForm.dataset.requestId = request.id;
  populateGuarantorSelect(guarantorOne, currentGroupMembers, activeMember?.id);
  populateGuarantorSelect(guarantorTwo, currentGroupMembers, activeMember?.id);
  if (guarantorMessage) {
    guarantorMessage.textContent = "Choose two group members again. Both will be asked to confirm.";
  }
  guarantorPanel.hidden = false;
  guarantorPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

if (portalDialog instanceof HTMLDialogElement) {
  portalDialog.querySelector(".modal-close").addEventListener("click", () => {
    portalDialog.close();
  });

  portalDialog.addEventListener("click", (event) => {
    if (event.target === portalDialog) {
      portalDialog.close();
    }
  });
}

document.querySelector("#login-panel").addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const button = event.currentTarget.querySelector("button[type='submit']");
  button.disabled = true;
  setPortalMessage("Checking your password…");
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setPortalMessage(`Unable to sign in: ${error.message}`);
      return;
    }
    if (!data.user || !data.session) {
      throw new Error("Password sign-in did not return an authenticated account. Please try again.");
    }

    await clearSession();
    form.querySelector("#login-password").value = "";
    setPortalMessage("Password confirmed. Sending your verification code…");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      setPortalMessage(`Your password was confirmed, but we could not send a verification code: ${otpError.message}`);
      return;
    }

    showEmailCodeForm(loginVerificationForm, loginVerificationEmail, loginVerificationCode, email, {
      title: "Check your email",
      intro: "Your password was confirmed. Enter the six-digit code we sent to finish signing in to your Vyro member account.",
      message: `A verification code was sent to ${email}.`,
    });
  } finally {
    button.disabled = false;
  }
}));

loginVerificationForm?.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const email = loginVerificationEmail.value.trim();
  const token = loginVerificationCode.value.trim();
  const button = loginVerificationForm.querySelector("button[type='submit']");
  button.disabled = true;
  setPortalMessage("Verifying your sign-in code…");
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) {
      setPortalMessage(`Unable to sign in: ${error.message}`);
      return;
    }
    if (!data.user) {
      throw new Error("The sign-in code did not return an account. Request a new code and try again.");
    }
    loginVerificationForm.reset();
    await checkMemberApproval(data.user);
  } finally {
    button.disabled = false;
  }
}));

document.querySelector("#signup-panel").addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email")).trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: formData.get("password"),
    options: {
      data: {
        full_name: formData.get("name"),
        phone: formData.get("phone"),
        privacy_notice_version: formData.get("privacy_notice_version"),
      },
    },
  });

  if (error) {
    setPortalMessage(`Unable to submit your access request: ${error.message}`);
    return;
  }
  if (!data.user) {
    setPortalMessage("The account request did not return a user. Please try again or contact the group administrator.");
    return;
  }

  if (data.user && !data.session) {
    form.reset();
    showSignupVerification(email);
    return;
  }

  if (data.session) await clearSession();
  setPortalMessage(
    "Your request was received. Wait for Vyro group approval before signing in."
  );
  form.reset();
}));

signupVerificationForm?.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const email = signupVerificationEmail.value.trim();
  const token = signupVerificationCode.value.trim();
  const verifyButton = signupVerificationForm.querySelector("button[type='submit']");
  verifyButton.disabled = true;
  setPortalMessage("Verifying your email…");
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });
    if (error) {
      setPortalMessage(`Unable to verify your email: ${error.message}`);
      return;
    }
    if (!data.user) {
      throw new Error("Email verification did not return an account. Request a new code and try again.");
    }
    if (data.session) await clearSession();
    signupVerificationForm.reset();
    showPortalForm("login");
    setPortalMessage("Your email is verified and your membership request was received. Wait for Vyro group approval before signing in.");
  } finally {
    verifyButton.disabled = false;
  }
}));

resendSignupCodeButton?.addEventListener("click", () => runPortalAction(async () => {
  const email = signupVerificationEmail.value.trim();
  if (!email) {
    throw new Error("Enter the email address used for your membership request.");
  }
  resendSignupCodeButton.disabled = true;
  setPortalMessage("Sending a new verification code…");
  try {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      throw new Error(`Unable to resend the verification code: ${error.message}`);
    }
    setPortalMessage(`A new verification code was sent to ${email}.`);
    signupVerificationCode?.focus();
  } finally {
    resendSignupCodeButton.disabled = false;
  }
}));

resendLoginCodeButton?.addEventListener("click", () => runPortalAction(async () => {
  const email = loginVerificationEmail.value.trim();
  if (!email) {
    throw new Error("Enter the email address used for your account.");
  }
  resendLoginCodeButton.disabled = true;
  setPortalMessage("Sending a new sign-in code…");
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      throw new Error(`Unable to resend the sign-in code: ${error.message}`);
    }
    setPortalMessage(`A new sign-in code was sent to ${email}.`);
    loginVerificationCode?.focus();
  } finally {
    resendLoginCodeButton.disabled = false;
  }
}));

recoveryVerificationForm?.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const email = recoveryVerificationEmail.value.trim();
  const token = recoveryVerificationCode.value.trim();
  const button = recoveryVerificationForm.querySelector("button[type='submit']");
  button.disabled = true;
  setPortalMessage("Verifying your password reset code…");
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "recovery",
    });
    if (error) {
      setPortalMessage(`Unable to verify your password reset code: ${error.message}`);
      return;
    }
    if (!data.user || !data.session) {
      throw new Error("The password reset code did not start a recovery session. Request a new code and try again.");
    }
    recoveryVerificationForm.hidden = true;
    recoveryForm.hidden = false;
    portalTitle.textContent = "Choose a new password";
    portalIntro.textContent = "Your email is verified. Set a new password for your Vyro member account.";
    setPortalMessage("");
    recoveryForm.querySelector("#recovery-password").focus();
  } finally {
    button.disabled = false;
  }
}));

resendRecoveryCodeButton?.addEventListener("click", () => runPortalAction(async () => {
  const email = recoveryVerificationEmail.value.trim();
  if (!email) {
    throw new Error("Enter the email address for the account you want to recover.");
  }
  resendRecoveryCodeButton.disabled = true;
  setPortalMessage("Sending a new password reset code…");
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      throw new Error(`Unable to resend the password reset code: ${error.message}`);
    }
    setPortalMessage(`If an account exists for ${email}, a new password reset code has been sent.`);
    recoveryVerificationCode?.focus();
  } finally {
    resendRecoveryCodeButton.disabled = false;
  }
}));

document.querySelectorAll("[data-password-reset]").forEach((button) => {
  button.addEventListener("click", () => runPortalAction(async () => {
    const email = activeMember?.email || document.querySelector("#login-email").value.trim();
    const message = button.closest(".portal-account")
      ?.querySelector(".account-profile-message");
    if (!email) {
      setPortalMessage("Enter your account email first, then request a password reset.");
      document.querySelector("#login-email").focus();
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      const text = `Unable to send a password reset code: ${error.message}`;
      if (message) message.textContent = text;
      else setPortalMessage(text);
      return;
    }
    if (message) message.textContent = "";
    showEmailCodeForm(recoveryVerificationForm, recoveryVerificationEmail, recoveryVerificationCode, email, {
      title: "Reset your password",
      intro: "Enter the six-digit password reset code sent to your email.",
      message: `If an account exists for ${email}, a password reset code has been sent.`,
    });
  }));
});

recoveryForm.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const formData = new FormData(recoveryForm);
  const password = String(formData.get("password") || "");
  const button = recoveryForm.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPortalMessage(`Unable to update your password: ${error.message}`);
      return;
    }
    recoveryForm.reset();
    recoveryForm.hidden = true;
    setPortalMessage("Your password has been updated.");
    if (data.user) {
      await checkMemberApproval(data.user);
    }
  } finally {
    button.disabled = false;
  }
}));

accountProfileForm.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  const formData = new FormData(accountProfileForm);
  const fullName = String(formData.get("full_name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const status = accountProfileForm.querySelector(".account-profile-message");
  const button = accountProfileForm.querySelector("button[type='submit']");
  button.disabled = true;
  status.textContent = "Saving your contact details…";
  try {
    const { error } = await supabase.rpc("update_my_member_profile", {
      p_full_name: fullName,
      p_phone: phone,
    });
    if (error) {
      status.textContent = `Unable to update your profile: ${error.message}`;
      return;
    }
    activeMemberProfile = { ...activeMemberProfile, full_name: fullName, phone };
    if (portalAccountName) {
      portalAccountName.textContent = fullName;
    }
    status.textContent = "Your contact details were updated.";
    await loadDashboard(activeMember, activeMemberProfile);
  } finally {
    button.disabled = false;
  }
}));

document.querySelector("[data-download-statement]").addEventListener("click", () => runPortalAction(() => exportMemberStatement()));
document.querySelector("[data-print-statement]").addEventListener("click", () => runPortalAction(() => exportMemberStatement(true)));
document.querySelector('[data-dashboard-list="loans"]').addEventListener("click", (event) => {
  const button = event.target.closest("[data-loan-agreement]");
  if (button) {
    printLoanAgreement(button.dataset.loanAgreement);
  }
});
document.querySelector('[data-dashboard-list="repayment-history"]').addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-receipt]");
  if (printButton) {
    printRepaymentReceipt(printButton.dataset.printReceipt);
    return;
  }
  const button = event.target.closest("[data-repayment-receipt]");
  if (button) {
    downloadRepaymentReceipt(button.dataset.repaymentReceipt);
  }
});

document.querySelector('[data-dashboard-list="notifications"]').addEventListener("click", (event) => runPortalAction(async () => {
  const button = event.target.closest("[data-notification-read]");
  if (!button) {
    return;
  }
  button.disabled = true;
  const { error } = await supabase
    .from("member_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", button.dataset.notificationRead);
  if (error) {
    button.disabled = false;
    setPortalMessage(`Unable to mark the notification as read: ${error.message}`);
    return;
  }
  await loadDashboard(activeMember, activeMemberProfile);
}));

document.querySelector(".portal-signout").addEventListener("click", () => runPortalAction(async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setPortalMessage(`Unable to sign out: ${error.message}`);
    return;
  }

  activeMember = null;
  activeMemberProfile = null;
  currentLoanEligibility = null;
  currentLoanRequests = [];
  currentGroupMembers = [];
  currentStatementData = null;
  document.querySelectorAll("[data-dashboard-list]").forEach((list) => list.replaceChildren());
  dashboardMetrics.forEach((metric) => {
    metric.textContent = "—";
  });
  if (accountProfileForm) {
    accountProfileForm.reset();
  }
  if (portalAccountName) {
    portalAccountName.textContent = "";
  }
  if (portalAccountEmail) {
    portalAccountEmail.textContent = "";
  }
  if (recoveryForm) {
    recoveryForm.hidden = true;
  }
  portalTabs.forEach((tab) => {
    tab.closest(".portal-tabs").hidden = false;
  });
  showPortalForm("login");
  setPortalMessage("You have been signed out.");
}));

loanLimitRefreshButton.addEventListener("click", () => runPortalAction(async () => {
  if (!activeMember) {
    throw new Error("Sign in to refresh your member loan limit.");
  }
  loanLimitRefreshButton.disabled = true;
  if (loanRequestResult) {
    loanRequestResult.textContent = "Refreshing your loan limit…";
  }
  try {
    const { data, error } = await supabase.rpc("get_member_loan_eligibility");
    if (error) {
      throw new Error(`Unable to refresh your loan limit: ${error.message}`);
    }
    const eligibility = data?.[0];
    if (!eligibility) {
      throw new Error("No loan eligibility details were returned. Contact the group administrator.");
    }
    updateLoanEligibility(eligibility);
    if (loanRequestResult) {
      loanRequestResult.textContent = "Your admin-set limit and current request cap have been refreshed.";
    }
  } finally {
    loanLimitRefreshButton.disabled = false;
  }
}));

memberPaymentType.addEventListener("change", updateMemberPaymentFields);
memberPaymentMethod.addEventListener("change", updateMemberPaymentFields);
memberPaymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    const button = memberPaymentForm.querySelector("button[type='submit']");
    const formData = new FormData(memberPaymentForm);
    const paymentType = String(formData.get("payment_type"));
    const paymentMethod = String(formData.get("payment_method"));
    button.disabled = true;
    memberPaymentMessage.textContent = paymentMethod === "manual"
      ? "Submitting your M-Pesa reference for review…"
      : "Sending the M-Pesa payment prompt…";
    try {
      if (paymentMethod === "manual") {
        const { error } = await supabase.rpc("submit_manual_mpesa_payment", {
          p_payment_type: paymentType,
          p_amount: Number(formData.get("amount")),
          p_phone_number: formData.get("phone_number"),
          p_manual_reference: formData.get("manual_reference"),
          p_loan_id: formData.get("loan_id") || null,
        });
        if (error) {
          throw new Error(error.message);
        }
        memberPaymentMessage.textContent = "Reference submitted. It will be added to your savings or repayment record after administrator verification.";
      } else {
        const { data, error } = await supabase.functions.invoke("mpesa-stk-push", {
          body: {
            payment_type: paymentType,
            amount: Number(formData.get("amount")),
            phone_number: formData.get("phone_number"),
            loan_id: formData.get("loan_id") || null,
          },
        });
        if (error) {
          throw new Error(error.message);
        }
        if (!data) {
          throw new Error("The payment service returned no response. Check your payment status before retrying.");
        }
        memberPaymentMessage.textContent =
          `${data.message} Paybill ${data.paybillNumber}, account/reference ${data.accountReference}.`;
      }
      memberPaymentForm.reset();
      updateMemberPaymentFields();
      await loadDashboard(activeMember, activeMemberProfile);
    } catch (error) {
      memberPaymentMessage.textContent = `Unable to submit payment: ${error instanceof Error ? error.message : "Unexpected error."}`;
    } finally {
      button.disabled = false;
    }
  })();
});

withdrawalRequestForm.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  if (!activeMember) {
    throw new Error("Sign in to request a savings withdrawal.");
  }
  const button = withdrawalRequestForm.querySelector("button[type='submit']");
  const formData = new FormData(withdrawalRequestForm);
  button.disabled = true;
  withdrawalRequestMessage.textContent = "Submitting your withdrawal request…";
  const { error } = await supabase.rpc("submit_savings_withdrawal_request", {
    p_amount: Number(formData.get("amount")),
    p_reason: formData.get("reason"),
  });
  if (error) {
    withdrawalRequestMessage.textContent = `Unable to submit your withdrawal request: ${error.message}`;
    button.disabled = false;
    return;
  }
  withdrawalRequestForm.reset();
  withdrawalRequestMessage.textContent = "Request submitted. It will remain pending until an administrator reviews it.";
  try {
    await loadDashboard(activeMember, activeMemberProfile);
  } catch (error) {
    withdrawalRequestMessage.textContent = `Your request was submitted, but its status could not be refreshed: ${error instanceof Error ? error.message : "Unexpected error."}`;
  }
}));

document.querySelector("[data-refresh-member-payments]").addEventListener("click", () => runPortalAction(async () => {
  if (!activeMember) {
    throw new Error("Sign in to refresh your M-Pesa payment status.");
  }
  await loadDashboard(activeMember, activeMemberProfile);
  memberPaymentMessage.textContent = "M-Pesa payment status refreshed.";
}));

loanRequestForm.addEventListener("submit", (event) => runPortalAction(async () => {
  event.preventDefault();
  if (!activeMember || !currentLoanEligibility?.eligible) {
    if (loanRequestResult) {
      loanRequestResult.textContent =
        currentLoanEligibility?.reason || "We could not confirm your eligibility. Please refresh and try again.";
    }
    return;
  }

  const formData = new FormData(loanRequestForm);
  const requestedAmount = Number(formData.get("amount"));
  const purpose = String(formData.get("purpose") || "").trim();
  const maximum = Number(currentLoanEligibility.max_request_amount) || 0;
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > maximum) {
    loanAmountInput.setCustomValidity(
      `Enter an amount greater than zero and no more than ${formatCurrency(maximum, currentLoanEligibility.currency || "KES")}.`
    );
    loanAmountInput.reportValidity();
    loanAmountInput.setCustomValidity("");
    return;
  }

  if (!purpose) {
    loanPurposeInput.focus();
    loanPurposeInput.reportValidity();
    return;
  }

  loanRequestButton.disabled = true;
  if (loanRequestResult) {
    loanRequestResult.textContent = "Submitting your request…";
  }

  try {
    const { error } = await supabase.from("loan_requests").insert({
      member_id: activeMember.id,
      requested_amount: requestedAmount,
      purpose,
    });

    if (error) {
      if (loanRequestResult) {
        loanRequestResult.textContent = `Unable to submit your loan request: ${error.message}`;
      }
      return;
    }

    loanRequestForm.reset();
    if (loanRequestResult) {
      loanRequestResult.textContent = "Your request was submitted. Choose two guarantors; it will go to group review after both accept.";
    }
    await loadDashboard(activeMember, activeMemberProfile);
  } finally {
    loanRequestButton.disabled = !currentLoanEligibility?.eligible;
  }
}));

if (menuToggle && primaryNav) {
  const setMobileNavOpen = (isOpen) => {
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.querySelector(".visually-hidden").textContent = isOpen
      ? "Close navigation"
      : "Open navigation";
    primaryNav.classList.toggle("is-open", isOpen);
    navBackdrop?.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("nav-open", isOpen);
    if (isOpen) {
      navClose?.focus();
    } else if (window.matchMedia("(max-width: 760px)").matches) {
      menuToggle.focus();
    }
  };

  menuToggle.addEventListener("click", () => {
    setMobileNavOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });

  navClose?.addEventListener("click", () => setMobileNavOpen(false));
  navBackdrop?.addEventListener("click", () => setMobileNavOpen(false));

  primaryNav.addEventListener("click", (event) => {
    if (
      event.target instanceof HTMLAnchorElement ||
      (event.target instanceof HTMLButtonElement && event.target !== navClose)
    ) {
      setMobileNavOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMobileNavOpen(false);
    }
  });
}
