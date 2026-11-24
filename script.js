/* ==================================
   ATS TUTORING — WEBSITE LOGIC
================================== */


/*
    SUBJECT DIRECTORY

    Add new subjects to this list whenever needed.
    They will automatically appear in the dropdown.
*/

const subjects = [
    "Accounting",
    "Advanced Algebra I & II",
    "Advanced English",
    "Algebra I & II",
    "Algebra III & IV",
    "American Literature I & II",
    "Analytical Geometry",
    "Anatomy & Physiology",
    "AP 2D Art",
    "AP Biology",
    "AP Calculus AB",
    "AP Computer Science Principles",
    "AP English Language & Composition",
    "AP English Literature & Composition",
    "AP Human Geography",
    "AP Physics",
    "AP Pre Calculus",
    "AP Research",
    "AP Seminar",
    "AP Statistics",
    "Biology I & II",
    "Business Administration",
    "Calculus I & II",
    "Chemistry I & II",
    "Civismo de México",
    "Computer Applications I & II",
    "Derecho (Mexican Law)",
    "English Literature I & II",
    "English Literature III & IV",
    "Español 9",
    "Estructura Socioeconómica de México",
    "Everyday Medicine",
    "Expresión Oral I & II",
    "French I & II",
    "French I & IV",
    "Historia de México",
    "Italian I & II",
    "Italian III & IV",
    "Literatura I & II",
    "Literature III & IV",
    "Makerspace I & II",
    "Marketing",
    "Microeconomics",
    "PAA (Examen de admisión)",
    "Personal Finance",
    "Physical Science I & II",
    "Physics I & II",
    "Psychology I & II",
    "Research Methods",
    "SAT Prep",
    "Senior Speeches",
    "Statistics",
    "Taller de Lectura y Redacción I & II",
    "Trigonometry",
    "United States History I & II",
    "World History I & II",
    "Writing & Style I & II"
];


/*
    APPLICATION STATE

    These variables remember what the student selected
    while moving between screens.
*/

const subjectAliases = {
    "Chemistry": "Chemistry I & II",
    "Biology": "Biology I & II",
    "Physics": "Physics I & II",
    "Physical Science": "Physical Science I & II",
    "World History": "World History I & II",
    "Civismo": "Civismo de México",
    "U.S. History": "United States History I & II",
    "Expresión Oral": "Expresión Oral I & II",
    "Lectura y Redacción": "Taller de Lectura y Redacción I & II",
    "Literatura": "Literatura I & II",
    "Algebra": "Algebra I & II",
    "Calculus": "Calculus I & II",
    "AP English Language and Composition": "AP English Language & Composition",
    "AP English Literature": "AP English Literature & Composition",
    "AP Precalculus": "AP Pre Calculus",
    "AP Calculus": "AP Calculus AB",
    "American Literature": "American Literature I & II",
    "Writing & Style": "Writing & Style I & II",
    "SAT": "SAT Prep",
    "PAA (Tec, UDEM, etc.)": "PAA (Examen de admisión)"
};
function subjectLabel(value) { return subjectAliases[value] || value; }

let selectedSubject = "";
let studentName = "";

// Remembers which feature the user wants to access.
let pendingFeature = null;
// Stores applications retrieved for the admin dashboard.
let adminApplications = [];
let adminLoadVersion = 0;
let editingApplicationId = null;
let mySessions = [];
let stopWatchingSessions = null;
let sessionWatchVersion = 0;
let sessionsError = "";
const busySessions = new Set();

// Stores the currently authenticated ATS user.
window.currentUser = null;


/*
    SCREEN NAVIGATION
*/

function showScreen(screenId) {

    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
    });

    const target = document.getElementById(screenId);

    if (target) {
        target.classList.add("active");
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


function goHome() {

    selectedSubject = "";
    studentName = "";
    pendingFeature = null;

    document.getElementById("subject-form").reset();
    document.getElementById("name-form").reset();

    showScreen("home-screen");
}

/*
    FEATURE ACCESS

    Require ATS Google authentication before entering
    the tutor directory or registration form.
*/

window.requestFeature = function(feature) {

    if (feature !== "find" && feature !== "signup") {
        return;
    }

    // Remember the user's intended destination.
    pendingFeature = feature;

    // Reset registration when starting a new sign-up.
    if (feature === "signup") {
        resetTutorRegistration();
    }

    // Already authenticated? Continue immediately.
    if (window.currentUser) {
        continueToFeature();
        return;
    }

    // Otherwise, request ATS Google authentication.
    showScreen("auth-screen");
};


function continueToFeature() {

    if (!window.currentUser || !pendingFeature) {
        return;
    }

    const destination = pendingFeature;
    pendingFeature = null;

    if (destination === "find") {
        showScreen("subject-screen");
    }

    if (destination === "signup") {
        startTutorRegistration();
    }

    if (destination === "sessions") openMySessions();

    if (destination === "status") {
        loadMyApplications();
    }

    if (destination === "admin") {

        if (!window.isAdminUser || !window.isAdminUser()) {
            alert("Administrator access required.");
            goHome();
            return;
        }

        loadAdminApplications();
    }
}


/*
    FIREBASE AUTHENTICATION UPDATES

    Firebase calls this whenever the user's login status changes.
*/

window.handleAuthStateChanged = function(user) {

    const previousUser = window.currentUser;
    const identityChanged = previousUser?.uid !== user?.uid;
    window.currentUser = user || null;
    if (identityChanged) resetTutorRegistration();
    updateGooglePhoto();
    startSessionUpdates();
    document.getElementById("my-sessions-button").classList.toggle("hidden", !user);
    document.getElementById("sign-out-button").classList.toggle("hidden", !user);
    if (!user || identityChanged) {
        adminApplications = [];
        adminLoadVersion++;
        for (const id of ["tutor-grid", "tutor-profile", "application-status-content",
            "admin-applications-content", "admin-tutors-content",
            "admin-dashboard-feedback", "admin-tutors-feedback", "session-list", "session-feedback"]) {
            document.getElementById(id).replaceChildren();
        }
    }

    const adminLink = document.getElementById("admin-dashboard-link");

    if (adminLink) {
        const isAdmin = Boolean(
            user &&
            window.isAdminUser &&
            window.isAdminUser()
        );

        adminLink.classList.toggle("hidden", !isAdmin);
    }

    if (identityChanged && previousUser && user) goHome();

    if (user && pendingFeature) {
        continueToFeature();
    }

    const protectedScreens = [
        "sessions-screen",
        "subject-screen",
        "name-screen",
        "results-screen",
        "profile-screen",
        "signup-screen",
        "signup-review-screen",
        "application-status-screen",
        "admin-dashboard-screen",
        "admin-tutors-screen"
    ];

    const currentScreen = document.querySelector(".screen.active");

    if (!user && currentScreen &&
        protectedScreens.includes(currentScreen.id)) {
        goHome();
        return;
    }

    if (
        user &&
        ["admin-dashboard-screen", "admin-tutors-screen"].includes(currentScreen?.id) &&
        (!window.isAdminUser || !window.isAdminUser())
    ) {
        goHome();
    }
};


/*
    POPULATE THE SUBJECT DROPDOWN
*/

function populateSubjects() {

    const dropdown = document.getElementById("subject-select");

    subjects.forEach(subject => {

        const option = document.createElement("option");

        option.value = subject;
        option.textContent = subject;

        dropdown.appendChild(option);
    });
}


/*
    SCREEN 1 → SCREEN 2

    Save the selected subject.
*/

document
    .getElementById("subject-form")
    .addEventListener("submit", function(event) {

        event.preventDefault();

        selectedSubject = document.getElementById("subject-select").value;

        if (!selectedSubject) {
            return;
        }

        showScreen("name-screen");
    });


/*
    SCREEN 2 → SCREEN 3

    Save the student's first name and display matches.
*/

document
    .getElementById("name-form")
    .addEventListener("submit", function(event) {

        event.preventDefault();

        studentName = document
            .getElementById("student-name")
            .value
            .trim();

        if (!studentName) {
            return;
        }

        displayTutors();
    });


function getAvatar(tutor) {
    const initials = tutor.name.trim().split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();

    const photo = typeof tutor.profilePhotoURL === "string"
        && /^https:\/\/lh[0-9]+[.]googleusercontent[.]com\/[^\s]+$/.test(tutor.profilePhotoURL)
        ? `<img src="${escapeHTML(tutor.profilePhotoURL)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : "";
    return `<div class="tutor-avatar" aria-hidden="true"><span>${escapeHTML(initials)}</span>${photo}</div>`;
}

// Keep the initials visible when an account's linked photo is unavailable.
document.addEventListener("error", event => {
    if (event.target.matches?.(".tutor-avatar img")) event.target.hidden = true;
}, true);

function updateGooglePhoto() {
    const photo = window.getGoogleProfilePhoto?.();
    const checkbox = document.getElementById("tutor-use-google-photo");
    checkbox.disabled = !photo;
    if (!photo) checkbox.checked = false;
    const name = [
        document.getElementById("tutor-first-name").value.trim(),
        document.getElementById("tutor-last-name").value.trim()
    ].filter(Boolean).join(" ") || window.currentUser?.displayName || "Your profile";
    document.getElementById("tutor-google-photo-preview").innerHTML = getAvatar({
        name,
        profilePhotoURL: checkbox.checked ? photo : null
    });
    document.getElementById("tutor-google-photo-hint").textContent = photo
        ? "If selected, this photo will be visible to signed-in ATS students after approval."
        : "No Google profile photo is available for this account. Your initials will be used.";
}

document.getElementById("tutor-use-google-photo").addEventListener("change", updateGooglePhoto);
for (const id of ["tutor-first-name", "tutor-last-name"]) {
    document.getElementById(id).addEventListener("input", updateGooglePhoto);
}

/*
    SAFELY DISPLAY TEXT

    Escape tutor-submitted text before inserting it into HTML.
*/

function escapeHTML(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}


/*
    SCREEN 3 — TUTOR CARDS
*/

async function displayTutors() {
    const user = window.currentUser;
    const subject = selectedSubject;
    if (!user || !subject) return;

    const grid = document.getElementById("tutor-grid");
    const emptyState = document.getElementById("no-tutors");

    document.getElementById("results-title").textContent =
        `Let's find your tutor${studentName ? ", " + studentName : ""}.`;

    document.getElementById("results-description").textContent =
        `Tutors who offer ${selectedSubject}.`;

    emptyState.classList.add("hidden");
    grid.textContent = "Loading tutors...";
    showScreen("results-screen");

    let matchingTutors;
    try {
        matchingTutors = await window.getTutorsForSubject(subject);
    } catch (error) {
        console.error("Tutor directory error:", error);
        if (window.currentUser === user && selectedSubject === subject) {
            grid.textContent = "We couldn’t load tutors. Go back and try again.";
        }
        return;
    }

    if (window.currentUser !== user || selectedSubject !== subject) return;
    grid.replaceChildren();

    if (matchingTutors.length === 0) {

        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");

    renderTutorCards(matchingTutors, grid);
}

function renderTutorCards(tutors, grid, manageTutors = false) {
    tutors.forEach(tutor => {
        tutor.name = `${tutor.firstName} ${tutor.lastName}`;
        tutor.rate = tutor.rateType === "paid" ? `MXN ${tutor.hourlyRate} per hour` : "Free tutoring";

        const card = document.createElement("article");

        card.className = "tutor-card";

        const tags = tutor.subjects
            .map(subject => `
                <span class="subject-tag">
                    ${escapeHTML(subjectLabel(subject))}
                </span>
            `)
            .join("");

        card.innerHTML = `

            <div class="tutor-card-content">

                ${getAvatar(tutor)}

                <h3 class="tutor-name">
                    ${escapeHTML(tutor.name)}
                </h3>

                <p class="tutor-grade">
                    Grade ${escapeHTML(tutor.grade)}
                </p>

                <div class="subject-tags">
                    ${tags}
                </div>

                <p class="tutor-description">
                    ${escapeHTML(tutor.bio)}
                </p>

            </div>

            <div class="tutor-card-footer">

                <p class="tutor-rate">
                    ${escapeHTML(tutor.rate)}
                </p>

                <button
                    class="button button-secondary"
                >
                    View Profile →
                </button>

            </div>
        `;

        card
            .querySelector("button")
            .addEventListener("click", () => {
                openTutorProfile(tutor, manageTutors);
            });

        grid.appendChild(card);
    });
}


/*
    SCREEN 4 — FULL TUTOR PROFILE
*/

function openTutorProfile(tutor, manageTutors = false) {
    if (!window.currentUser) return;
    if (manageTutors && !window.isAdminUser?.()) return;

    const back = document.getElementById("tutor-profile-back");
    back.onclick = () => manageTutors ? loadExistingTutors() : displayTutors();

    const profile = document.getElementById("tutor-profile");
    const tags = tutor.subjects.map(subject =>
        `<span class="subject-tag">${escapeHTML(subjectLabel(subject))}</span>`
    ).join("");

    const availability = availabilityDays
        .filter(day => tutor.availability?.[day]?.length && Array.isArray(tutor.availability[day]))
        .map(day => `
            <div class="availability-item">
                <span><strong>${escapeHTML(day)}</strong> ·
                    ${tutor.availability[day].map(escapeHTML).join(", ")}
                </span>
            </div>
        `).join("");


    profile.innerHTML = `

        <article class="profile-card">

            <div class="profile-header">

                ${getAvatar(tutor)}

                <div>
                    <h2>${escapeHTML(tutor.name)}</h2>

                    <p>
                        Grade ${escapeHTML(tutor.grade)} ·
                        ${escapeHTML((tutor.formats || []).join(" · "))}
                    </p>
                </div>

            </div>

            <section class="profile-section">

                <h3>About this tutor</h3>

                <p>${escapeHTML(tutor.bio)}</p>

            </section>

            <section class="profile-section">

                <h3>Subjects offered</h3>

                <div class="subject-tags">
                    ${tags}
                </div>

            </section>

            <section class="profile-section">

                <h3>Rate</h3>

                <p>${escapeHTML(tutor.rate)}</p>

            </section>

            <section class="profile-section">

                <h3>Availability</h3>

                <p>
                    Choose an available time below. A request is not a confirmed session until the tutor accepts.
                </p>

                <div class="availability-list">
                    ${availability || "<p>No availability listed.</p>"}
                </div>

            </section>

            <section class="profile-section">

                <h3>Request a session</h3>
                <div id="session-request-container"></div>

            </section>

        </article>
    `;

    if (manageTutors) {
        const controls = document.createElement("section");
        controls.className = "profile-section tutor-management";
        controls.innerHTML = `
            <button type="button" class="button button-danger">Remove as tutor</button>
            <p class="admin-feedback" role="status" aria-live="polite"></p>
        `;
        const button = controls.querySelector("button");
        const feedback = controls.querySelector('[role="status"]');
        button.addEventListener("click", async () => {
            if (!window.confirm(`Remove ${tutor.name} as a tutor? Their profile will disappear from subject searches.`)) return;
            button.disabled = true;
            feedback.textContent = "Removing tutor...";
            const user = window.currentUser;
            try {
                await window.removeExistingTutor(tutor.id);
                if (window.currentUser === user && window.isAdminUser?.()) {
                    await loadExistingTutors(`${tutor.name} has been removed as a tutor.`);
                }
            } catch (error) {
                console.error("Tutor removal error:", error);
                feedback.textContent = error.message || "We couldn’t remove this tutor. Please try again.";
            } finally {
                button.disabled = false;
            }
        });
        profile.querySelector("article").appendChild(controls);
    }

    addSessionRequestForm(tutor);
    showScreen("profile-screen");
}


/*
    INITIALIZE THE WEBSITE
*/

populateSubjects();

/* ==================================
   TUTOR REGISTRATION LOGIC
================================== */


/*
    REGISTRATION STATE

    The form keeps a draft in memory until the student submits the application.
*/

let signupStep = 1;

const selectedTutorSubjects = new Set();

const tutorAvailability = {};

let activeAvailabilityDay = "Monday";


/*
    STEP HEADINGS
*/

const signupStepContent = {
    1: {
        label: "STEP 01 OF 03",
        title: "Let's get to know you.",
        description: "Start with a few basic details.",
        number: "01"
    },

    2: {
        label: "STEP 02 OF 03",
        title: "What can you teach?",
        description: "Choose your subjects and tutoring preferences.",
        number: "02"
    },

    3: {
        label: "STEP 03 OF 03",
        title: "Make time to help.",
        description: "Set your availability and session preferences.",
        number: "03"
    }
};


/*
    UPDATE THE CURRENT STEP
*/

function updateSignupStep() {

    document.querySelectorAll(".signup-step").forEach(step => {

        step.classList.toggle(
            "active",
            Number(step.dataset.step) === signupStep
        );

    });

    const content = signupStepContent[signupStep];

    document.getElementById("signup-step-label").textContent =
        content.label;

    document.getElementById("signup-step-title").textContent =
        content.title;

    document.getElementById("signup-step-description").textContent =
        content.description;

    document.getElementById("signup-step-number").textContent =
        content.number;

    document.getElementById("signup-progress-bar").style.width =
        `${(signupStep / 3) * 100}%`;

    document.getElementById("signup-back-button").classList.toggle(
        "hidden",
        signupStep === 1
    );

    document.getElementById("signup-next-button").classList.toggle(
        "hidden",
        signupStep === 3
    );

    document.getElementById("signup-submit-button").classList.toggle(
        "hidden",
        signupStep !== 3
    );

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/*
    RESET THE REGISTRATION FORM

    This runs whenever someone starts a new registration.
*/

function resetTutorRegistration() {
    editingApplicationId = null;
    document.getElementById("profile-edit-notice")?.classList.add("hidden");
    document.getElementById("submit-application-button").textContent = "Submit application";

    document.getElementById("tutor-registration-form").reset();
    updateTutorContact();
    updateGooglePhoto();

    signupStep = 1;

    selectedTutorSubjects.clear();

    Object.keys(tutorAvailability).forEach(day => {
        delete tutorAvailability[day];
    });

    activeAvailabilityDay = "Monday";

    document.getElementById("tutor-hourly-rate").required = false;

    document.getElementById("hourly-rate-container").classList.add("hidden");

    renderTutorSubjects();

    renderAvailabilityDays();

    renderAvailabilityTimes();

    updateAvailabilitySummary();

    updateSignupStep();

    clearSignupErrors();
}


/*
    CLEAR VALIDATION ERRORS
*/

function clearSignupErrors() {

    document.querySelectorAll(
        "#signup-screen .field-error"
    ).forEach(error => {
        error.classList.add("hidden");
    });

}

/*
    SUBJECT PICKER
*/

const subjectSearch = document.getElementById("tutor-subject-search");


function renderTutorSubjects() {

    const optionsContainer =
        document.getElementById("tutor-subject-options");

    const selectedContainer =
        document.getElementById("selected-subjects");

    const searchTerm = subjectSearch.value
        .trim()
        .toLowerCase();

    optionsContainer.innerHTML = "";

    subjects
        .filter(subject => subject.toLowerCase().includes(searchTerm))
        .forEach(subject => {

            const button = document.createElement("button");

            button.type = "button";

            button.className =
                "subject-option" +
                (selectedTutorSubjects.has(subject) ? " selected" : "");

            button.setAttribute(
                "aria-pressed",
                selectedTutorSubjects.has(subject)
            );

            button.textContent = subject;

            button.addEventListener("click", () => {

                if (selectedTutorSubjects.has(subject)) {
                    selectedTutorSubjects.delete(subject);
                } else {
                    selectedTutorSubjects.add(subject);
                }

                renderTutorSubjects();

            });

            optionsContainer.appendChild(button);

        });


    selectedContainer.innerHTML = "";

    [...selectedTutorSubjects].forEach(subject => {

        const chip = document.createElement("span");

        chip.className = "selected-subject-chip";

        const text = document.createElement("span");

        text.textContent = subject;

        const removeButton = document.createElement("button");

        removeButton.type = "button";

        removeButton.textContent = "×";

        removeButton.setAttribute(
            "aria-label",
            `Remove ${subject}`
        );

        removeButton.addEventListener("click", () => {

            selectedTutorSubjects.delete(subject);

            renderTutorSubjects();

        });

        chip.append(text, removeButton);

        selectedContainer.appendChild(chip);

    });


    document.getElementById("selected-subject-count").textContent =
        `${selectedTutorSubjects.size} selected`;

}


subjectSearch.addEventListener("input", renderTutorSubjects);


/*
    VALIDATE SUBJECT SELECTION
*/

function validateSelectedSubjects() {

    const error = document.getElementById("subject-selection-error");

    const isValid = selectedTutorSubjects.size > 0;

    error.classList.toggle("hidden", isValid);

    return isValid;
}


/*
    TUTORING FORMAT VALIDATION
*/

function validateTutorFormat() {

    const selectedFormats = document.querySelectorAll(
        'input[name="format"]:checked'
    );

    const isValid = selectedFormats.length > 0;

    document.getElementById("format-selection-error")
        .classList.toggle("hidden", isValid);

    return isValid;
}


/*
    AVAILABILITY BUILDER

    Tutors select days and then choose time slots for each day.
*/

const availabilityDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
];


const availabilityTimes = [
    "7:00 AM",
    "8:00 AM",
    "9:00 AM",
    "10:00 AM",
    "11:00 AM",
    "12:00 PM",
    "1:00 PM",
    "2:00 PM",
    "3:00 PM",
    "4:00 PM",
    "5:00 PM",
    "6:00 PM",
    "7:00 PM",
    "8:00 PM",
    "9:00 PM"
];


function renderAvailabilityDays() {

    const container = document.getElementById("availability-days");

    container.innerHTML = "";

    availabilityDays.forEach(day => {

        const button = document.createElement("button");
        const hasSelectedTimes = (tutorAvailability[day]?.size || 0) > 0;

        button.type = "button";

        button.className =
            "day-button" +
            (hasSelectedTimes ? " selected" : "") +
            (activeAvailabilityDay === day ? " viewing" : "");

        button.textContent = day.slice(0, 3);

        button.setAttribute(
            "aria-pressed",
            hasSelectedTimes
        );

        button.setAttribute(
            "aria-label",
            `${day}${hasSelectedTimes ? ", times selected" : ""}${activeAvailabilityDay === day ? ", viewing" : ""}`
        );

        button.addEventListener("click", () => {

            activeAvailabilityDay = day;

            renderAvailabilityDays();

            renderAvailabilityTimes();

        });

        container.appendChild(button);

    });

}


function renderAvailabilityTimes() {

    const container = document.getElementById("availability-times");

    const title = document.getElementById("availability-day-title");

    const selectAllButton = document.getElementById("select-all-times");

    title.textContent = activeAvailabilityDay;

    container.innerHTML = "";

    const selectedTimes =
        tutorAvailability[activeAvailabilityDay] || new Set();


    availabilityTimes.forEach(time => {

        const button = document.createElement("button");

        button.type = "button";

        button.className =
            "time-button" +
            (selectedTimes.has(time) ? " selected" : "");

        button.textContent = time;

        button.setAttribute(
            "aria-pressed",
            selectedTimes.has(time)
        );

        button.addEventListener("click", () => {

            if (!tutorAvailability[activeAvailabilityDay]) {
                tutorAvailability[activeAvailabilityDay] = new Set();
            }

            const dayTimes = tutorAvailability[activeAvailabilityDay];

            if (dayTimes.has(time)) {
                dayTimes.delete(time);
            } else {
                dayTimes.add(time);
            }

            if (dayTimes.size === 0) {
                delete tutorAvailability[activeAvailabilityDay];
            }

            renderAvailabilityDays();

            renderAvailabilityTimes();

            updateAvailabilitySummary();

        });

        container.appendChild(button);

    });


    selectAllButton.textContent =
        selectedTimes.size === availabilityTimes.length
            ? "Clear all"
            : "Select all";

}


document.getElementById("select-all-times")
    .addEventListener("click", () => {

        const currentTimes =
            tutorAvailability[activeAvailabilityDay] || new Set();

        if (currentTimes.size === availabilityTimes.length) {

            delete tutorAvailability[activeAvailabilityDay];

        } else {

            tutorAvailability[activeAvailabilityDay] =
                new Set(availabilityTimes);

        }

        renderAvailabilityDays();

        renderAvailabilityTimes();

        updateAvailabilitySummary();

    });


function updateAvailabilitySummary() {

    const summary = document.getElementById("availability-summary-text");

    let totalSlots = 0;

    availabilityDays.forEach(day => {

        if (tutorAvailability[day]) {
            totalSlots += tutorAvailability[day].size;
        }

    });


    if (totalSlots === 0) {

        summary.textContent = "No time slots selected yet.";

        return;
    }


    const dayCount = availabilityDays.filter(day =>
        tutorAvailability[day] &&
        tutorAvailability[day].size > 0
    ).length;


    summary.textContent =
        `${totalSlots} time slots across ${dayCount} ` +
        `${dayCount === 1 ? "day" : "days"} selected.`;

}


function validateTutorAvailability() {

    const totalSlots = Object.values(tutorAvailability)
        .reduce((total, times) => total + times.size, 0);

    const isValid = totalSlots > 0;

    document.getElementById("availability-selection-error")
        .classList.toggle("hidden", isValid);

    return isValid;
}

function updateTutorContact() {
    const method = document.getElementById("tutor-contact").value;
    const phone = document.getElementById("tutor-phone");
    const consent = document.getElementById("tutor-share-contact");
    document.getElementById("tutor-phone-field").classList.toggle("hidden", method !== "Phone number");
    document.getElementById("tutor-contact-consent").classList.toggle("hidden", !method);
    phone.disabled = method !== "Phone number";
    phone.required = method === "Phone number";
    phone.setCustomValidity("");
    consent.disabled = !method;
    consent.required = Boolean(method);
    consent.checked = false;
    document.getElementById("tutor-contact-hint").textContent = method === "School email"
        ? `Your school email will be ${window.currentUser?.email || "your signed-in ATS address"}.`
        : method === "Phone number"
            ? "Include a country code if needed. These details will be shared only after you accept a student’s session request."
            : "You can apply without adding contact details.";
}

function validateTutorContact() {
    const method = document.getElementById("tutor-contact").value;
    if (!method) return true;
    const phone = document.getElementById("tutor-phone");
    phone.setCustomValidity("");
    if (method === "Phone number") {
        const value = phone.value.trim();
        const digits = value.replace(/[^0-9]/g, "");
        if (!/^\+?[0-9\s().-]+$/.test(value) || digits.length < 7 || digits.length > 15) {
            phone.setCustomValidity("Enter a phone number with 7 to 15 digits, including a country code if needed.");
        }
        if (!phone.reportValidity()) return false;
    }
    return document.getElementById("tutor-share-contact").reportValidity();
}

document.getElementById("tutor-contact").addEventListener("change", updateTutorContact);
document.getElementById("tutor-phone").addEventListener("input", event => event.target.setCustomValidity(""));


/*
    SESSION CAPACITY COUNTER
*/

const capacityInput = document.getElementById("tutor-max-students");


function updateCapacity(amount) {

    let currentValue = Number(capacityInput.value) || 1;

    currentValue = Math.min(
        50,
        Math.max(1, currentValue + amount)
    );

    capacityInput.value = currentValue;

}


document.getElementById("capacity-decrease")
    .addEventListener("click", () => updateCapacity(-1));


document.getElementById("capacity-increase")
    .addEventListener("click", () => updateCapacity(1));


capacityInput.addEventListener("change", () => {

    let value = Number(capacityInput.value);

    if (!Number.isFinite(value)) {
        value = 1;
    }

    value = Math.round(value);

    value = Math.max(1, Math.min(50, value));

    capacityInput.value = value;

});


/*
    FREE OR PAID TUTORING
*/

const rateTypeInputs = document.querySelectorAll(
    'input[name="rateType"]'
);


function updateRateOptions() {

    const rateType = document.querySelector(
        'input[name="rateType"]:checked'
    ).value;

    const rateContainer =
        document.getElementById("hourly-rate-container");

    const rateInput =
        document.getElementById("tutor-hourly-rate");

    const isPaid = rateType === "paid";

    rateContainer.classList.toggle("hidden", !isPaid);

    rateInput.required = isPaid;

}


rateTypeInputs.forEach(input => {

    input.addEventListener("change", updateRateOptions);

});


/*
    BIO CHARACTER COUNTER
*/

document.getElementById("tutor-bio")
    .addEventListener("input", event => {

        document.getElementById("bio-character-count").textContent =
            event.target.value.length;

    });


/*
    STEP VALIDATION
*/

function validateSignupStep() {

    clearSignupErrors();

    const currentStepElement = document.querySelector(
        `.signup-step[data-step="${signupStep}"]`
    );

    const inputs = [
        ...currentStepElement.querySelectorAll(
            "input, select, textarea"
        )
    ];


    for (const input of inputs) {

        if (
            input.disabled ||
            input.type === "file" ||
            input.type === "checkbox" ||
            input.type === "radio"
        ) {
            continue;
        }

        if (input.required && !input.checkValidity()) {

            input.reportValidity();

            return false;
        }

    }


    if (signupStep === 2) {

        const validSubjects = validateSelectedSubjects();

        const validFormat = validateTutorFormat();

        const validRate =
            document.querySelector(
                'input[name="rateType"]:checked'
            ).value !== "paid" ||
            document.getElementById("tutor-hourly-rate").checkValidity();

        if (!validSubjects || !validFormat || !validRate) {

            if (!validRate) {
                document.getElementById("tutor-hourly-rate").reportValidity();
            }

            return false;
        }

    }


    if (signupStep === 3) {

        const validAvailability = validateTutorAvailability();

        if (!validAvailability || !validateTutorContact()) {
            return false;
        }

    }


    return true;
}


/*
    NEXT AND BACK BUTTONS
*/

document.getElementById("signup-next-button")
    .addEventListener("click", () => {

        if (!validateSignupStep()) {
            return;
        }

        if (signupStep < 3) {

            signupStep++;

            updateSignupStep();

        }

    });


document.getElementById("signup-back-button")
    .addEventListener("click", () => {

        if (signupStep > 1) {

            signupStep--;

            updateSignupStep();

        }

    });


/*
    FORM SUBMISSION

    This only creates a preview.
    No information is sent or saved.
*/

document.getElementById("tutor-registration-form")
    .addEventListener("submit", event => {

        event.preventDefault();

        if (!validateSignupStep()) {
            return;
        }

        renderRegistrationReview();

        showScreen("signup-review-screen");

    });


/*
    CREATE THE REGISTRATION REVIEW
*/

function renderRegistrationReview() {

    const firstName = document
        .getElementById("tutor-first-name")
        .value
        .trim();

    const lastName = document
        .getElementById("tutor-last-name")
        .value
        .trim();

    const grade = document
        .getElementById("tutor-grade")
        .value;

    const bio = document
        .getElementById("tutor-bio")
        .value
        .trim();

    const maxStudents = capacityInput.value;

    const rateType = document.querySelector(
        'input[name="rateType"]:checked'
    ).value;

    const rate = rateType === "free"
        ? "Free tutoring"
        : `MXN $${document.getElementById("tutor-hourly-rate").value} per hour`;

    const formats = [
        ...document.querySelectorAll('input[name="format"]:checked')
    ].map(input => input.value);


    const subjectsHTML = [...selectedTutorSubjects]
        .map(subject => `
            <span class="subject-tag">
                ${escapeHTML(subjectLabel(subject))}
            </span>
        `)
        .join("");


    const availabilityHTML = availabilityDays
        .filter(day =>
            tutorAvailability[day] &&
            tutorAvailability[day].size > 0
        )
        .map(day => `

            <p>
                <strong>${escapeHTML(day)}:</strong>
                ${[...tutorAvailability[day]]
                    .map(escapeHTML)
                    .join(", ")}
            </p>

        `)
        .join("");


    const avatarHTML = getAvatar({
        name: `${firstName} ${lastName}`,
        profilePhotoURL: document.getElementById("tutor-use-google-photo").checked
            ? window.getGoogleProfilePhoto?.() : null
    });

    const review = document.getElementById(
        "registration-review-card"
    );


    review.innerHTML = `

        <div class="review-profile-header">

            ${avatarHTML}

            <div>
                <h3>
                    ${escapeHTML(firstName)} ${escapeHTML(lastName)}
                </h3>

                <p>
                    Grade ${escapeHTML(grade)} ·
                    ${escapeHTML(formats.join(" / "))}
                </p>
            </div>

        </div>


        <div class="review-detail">

            <h4>About me</h4>

            <p>${escapeHTML(bio)}</p>

        </div>


        <div class="review-detail">

            <h4>Subjects I can tutor</h4>

            <div class="subject-tags">
                ${subjectsHTML}
            </div>

        </div>


        <div class="review-detail">

            <h4>Tutoring rate</h4>

            <p>${escapeHTML(rate)}</p>

        </div>


        <div class="review-detail">

            <h4>Availability</h4>

            ${availabilityHTML}

        </div>


        <div class="review-detail">

            <h4>Maximum students per session</h4>

            <p>${escapeHTML(maxStudents)} students</p>

        </div>


        <div class="review-detail">

            <h4>Contact</h4>
            <p>${escapeHTML(document.getElementById("tutor-contact").value === "School email"
                ? window.currentUser?.email
                : document.getElementById("tutor-contact").value === "Phone number"
                    ? document.getElementById("tutor-phone").value.trim() : "Not provided")}</p>

        </div>

    `;

}


/*
    SUBMIT TUTOR APPLICATION
*/

async function submitRegistration() {
    const user = window.currentUser;

    if (!user) {
        alert("Please sign in before submitting your application.");
        return;
    }
    if (!validateTutorContact()) return;

    const firstName = document
        .getElementById("tutor-first-name")
        .value.trim();

    const lastName = document
        .getElementById("tutor-last-name")
        .value.trim();

    const rateType = document.querySelector(
        'input[name="rateType"]:checked'
    ).value;

    const formats = [
        ...document.querySelectorAll('input[name="format"]:checked')
    ].map(input => input.value);

    const availability = Object.fromEntries(
        Object.entries(tutorAvailability).filter(([, times]) => times.size > 0).map(([day, times]) => [
            day,
            [...times]
        ])
    );

    const applicationData = {

        firstName,
        lastName,

        grade: document.getElementById("tutor-grade").value,

        bio: document.getElementById("tutor-bio").value.trim(),
        profilePhotoURL: document.getElementById("tutor-use-google-photo").checked
            ? window.getGoogleProfilePhoto?.() || null : null,

        subjects: [...selectedTutorSubjects],

        formats,

        rateType,

        hourlyRate: rateType === "paid"
            ? Number(document.getElementById("tutor-hourly-rate").value)
            : null,

        availability,

        maxStudents: Number(capacityInput.value),

        contactMethod: document.getElementById("tutor-contact").value,
        contactPhone: document.getElementById("tutor-contact").value === "Phone number"
            ? document.getElementById("tutor-phone").value.trim().replace(/[^+0-9]/g, "") : null,
        contactConsent: document.getElementById("tutor-contact").value
            ? document.getElementById("tutor-share-contact").checked : false,
        shareSchoolEmail: document.getElementById("tutor-contact").value === "School email"
            && document.getElementById("tutor-share-contact").checked

    };

    const button = document.getElementById("submit-application-button");
    if (button.disabled) return;

    try {

        button.disabled = true;
        button.textContent = "Submitting...";

        const submitted = await window.submitTutorApplication(applicationData, editingApplicationId);
        if (window.currentUser !== user) return;

        alert(submitted
            ? "Your tutor application was submitted and is awaiting review."
            : "You already have a tutor application on file.");

        await loadMyApplications();

    } catch (error) {

        console.error("Application submission error:", error);

        alert(
            error.message || "We couldn't submit your application. Please try again."
        );

    } finally {

        button.disabled = false;
        button.textContent = editingApplicationId ? "Save and send for review" : "Submit application";

    }

}

/* ==================================
   TUTOR APPLICATION STATUS
================================== */

function requestApplicationStatus() {

    if (!window.currentUser) {
        pendingFeature = "status";
        showScreen("auth-screen");
        return;
    }

    loadMyApplications();
}


async function loadMyApplications() {

    const container = document.getElementById(
        "application-status-content"
    );

    container.innerHTML = "Loading your applications...";

    showScreen("application-status-screen");

    try {

        const user = window.currentUser;
        const applications = await window.getMyTutorApplications();
        if (window.currentUser !== user) return;

        if (applications.length === 0) {

            container.innerHTML = `
                <div class="empty-state">
                    <h3>No applications found.</h3>
                    <p>
                        You haven't submitted a tutor application yet.
                    </p>
                </div>
            `;

            return;
        }

        container.innerHTML = applications.map(application => {

            const overallStatus = application.status || "pending";

            const statusLabels = {
                pending: "Awaiting approval",
                approved: "Approved",
                rejected: "Rejected",
                partially_approved: "Partially approved",
                removed: "Tutor access removed"
            };

            const subjectHTML = Object.entries(
                application.subjectStatuses || {}
            ).map(([subject, status]) => {

                const labels = {
                    pending: "Pending",
                    approved: "Approved",
                    rejected: "Not approved"
                };

                return `
                    <div class="review-detail">
                        <strong>${escapeHTML(subjectLabel(subject))}</strong>
                        <p>${labels[status] || "Pending"}</p>
                    </div>
                `;

            }).join("");

            return `
                <article class="profile-card">

                    <h3>
                        ${escapeHTML(application.firstName)}
                        ${escapeHTML(application.lastName)}
                    </h3>

                    <p>
                        Overall status:
                        <strong>
                            ${statusLabels[overallStatus] || "Pending"}
                        </strong>
                    </p>

                    ${overallStatus === "removed"
                        ? "<p>Your tutor profile has been removed from the directory. Please contact the school reviewer for more information.</p>"
                        : ""}
                    <h4>${overallStatus === "removed" ? "Original subject decisions" : "Subject decisions"}</h4>

                    ${subjectHTML}

                </article>
            `;

        }).join("");
        applications.forEach((application, index) => {
            if (application.status === "removed") return;
            const button = document.createElement("button");
            button.className = "button button-secondary";
            button.textContent = "Edit profile / application";
            button.addEventListener("click", () => editTutorApplication(application));
            const note = document.createElement("p");
            note.className = "input-hint";
            note.textContent = "Changes need school approval. Your listing pauses while the updated profile is reviewed. Existing confirmed sessions stay on your schedule.";
            container.children[index].append(note, button);
        });

    } catch (error) {

        console.error("Application status error:", error);

        container.innerHTML = `
            <p>
                We couldn't retrieve your application status.
                Please try again.
            </p>
        `;

    }
}

/* ==================================
   ADMIN DASHBOARD
================================== */

// Request access to the admin dashboard
function requestAdminDashboard() {

    if (!window.currentUser) {
        pendingFeature = "admin";
        showScreen("auth-screen");
        return;
    }

    if (!window.isAdminUser || !window.isAdminUser()) {
        alert("Administrator access required.");
        return;
    }

    loadAdminApplications();
}


// Each request has a version so an older response cannot overwrite a newer view.
async function loadAdminApplications(message = "") {
    if (!window.currentUser || !window.isAdminUser?.()) {
        alert("Administrator access required.");
        goHome();
        return;
    }

    const version = ++adminLoadVersion;
    const user = window.currentUser;
    const container = document.getElementById("admin-applications-content");
    const feedback = document.getElementById("admin-dashboard-feedback");
    container.textContent = "Loading applications...";
    feedback.textContent = message;
    showScreen("admin-dashboard-screen");

    try {
        await window.prepareSchedulingProfiles();
        const applications = await window.getPendingTutorApplications();
        if (window.currentUser !== user || version !== adminLoadVersion) return;
        adminApplications = applications.filter(application => application.status === "pending");
        adminApplications.sort((a, b) =>
            (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)
        );

        if (adminApplications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>All caught up.</h3>
                    <p>There are no applications awaiting approval.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `<h3 class="admin-list-title">Awaiting approval (${adminApplications.length})</h3>`;
        adminApplications.forEach(application => {
            const card = document.createElement("article");
            card.className = "profile-card admin-application-card";
            card.dataset.applicationId = application.id;
            card.innerHTML = `
                <div class="admin-review-heading">
                    <div>
                        <h2>${escapeHTML(application.firstName)} ${escapeHTML(application.lastName)}</h2>
                        <p>Grade ${escapeHTML(application.grade)}</p>
                    </div>
                    <p class="application-status">Awaiting approval</p>
                </div>
                <button type="button" class="button button-secondary admin-review-toggle"
                    aria-expanded="false" aria-controls="application-review-${escapeHTML(application.id)}">Review application</button>
                <div id="application-review-${escapeHTML(application.id)}" class="admin-application-detail hidden"></div>
            `;
            card.querySelector(".admin-review-toggle").addEventListener("click", () => openAdminApplication(application.id, card));
            container.appendChild(card);
        });
    } catch (error) {
        if (window.currentUser !== user || version !== adminLoadVersion) return;
        console.error("Admin dashboard error:", error);
        container.innerHTML = `<div class="empty-state"><h3>Unable to load applications.</h3><p>Please refresh to try again.</p></div>`;
    }
}

function openAdminApplication(applicationId, card) {
    if (!window.isAdminUser?.()) return;
    const application = adminApplications.find(item => item.id === applicationId);
    if (!application || application.status !== "pending") return;

    const detail = card.querySelector(".admin-application-detail");
    const reviewButton = card.querySelector(".admin-review-toggle");
    function setExpanded(expanded) {
        detail.classList.toggle("hidden", !expanded);
        reviewButton.setAttribute("aria-expanded", expanded);
        reviewButton.textContent = expanded ? "Hide application" : "Review application";
    }
    if (detail.childElementCount) {
        setExpanded(detail.classList.contains("hidden"));
        return;
    }

    const name = `${application.firstName} ${application.lastName}`;
    const subjects = application.subjects || [];
    const availability = Object.entries(application.availability || {})
        .filter(([, times]) => Array.isArray(times) && times.length > 0)
        .map(([day, times]) => `
        <p><strong>${escapeHTML(day)}</strong> ${escapeHTML(times.join(", "))}</p>
    `).join("");
    const rate = application.rateType === "paid"
        ? `MXN $${escapeHTML(application.hourlyRate)} per hour` : "Free tutoring";

    detail.innerHTML = `
            <p class="admin-subject-intro">${escapeHTML(name)} is requesting being a tutor for the following subjects:</p>
            <div class="subject-tags">${subjects.map(subject => `<span class="subject-tag">${escapeHTML(subjectLabel(subject))}</span>`).join("")}</div>
            <div class="admin-decision-actions">
                <button type="button" class="button button-accept" data-decision="approved">Accept for all subjects</button>
                <button type="button" class="button button-danger" data-decision="rejected">Reject for all subjects</button>
            </div>
            <p class="admin-feedback" role="status" aria-live="polite"></p>
            <details class="admin-review-details">
                <summary>View more details and decide by subject</summary>
                <div class="admin-details-layout">
                <div class="admin-metadata">
                ${application.profilePhotoURL
                    ? `<div class="review-detail admin-metadata-wide"><h4>Profile photo</h4>${getAvatar({name, profilePhotoURL: application.profilePhotoURL})}</div>`
                    : ""}
                <div class="review-detail admin-metadata-wide"><h4>About the applicant</h4><p>${escapeHTML(application.bio)}</p></div>
                <div class="review-detail"><h4>School email</h4><p>${escapeHTML(application.applicantEmail)}</p></div>
                <div class="review-detail"><h4>Tutoring formats</h4><p>${escapeHTML((application.formats || []).join(", "))}</p></div>
                <div class="review-detail"><h4>Tutoring rate</h4><p>${rate}</p></div>
                <div class="review-detail admin-metadata-wide"><h4>Availability</h4>${availability || "<p>Not provided.</p>"}</div>
                <div class="review-detail"><h4>Maximum students per session</h4><p>${escapeHTML(application.maxStudents ?? "Not provided")}</p></div>
                <div class="review-detail"><h4>Preferred contact method</h4><p>${escapeHTML(application.contactMethod || "Not provided")}</p></div>
                ${application.contactMethod === "Phone number"
                    ? `<div class="review-detail"><h4>Contact phone</h4><p>${escapeHTML(application.contactPhone || "Not provided")}</p></div>` : ""}
                </div>
                <form class="admin-subject-decisions">
                    <h4>Decide by subject</h4>
                    ${subjects.map(subject => `
                        <label class="form-field">
                            <span>${escapeHTML(subjectLabel(subject))}</span>
                            <select data-subject="${escapeHTML(subject)}" required>
                                <option value="">Choose a decision</option>
                                <option value="approved">Accept</option>
                                <option value="rejected">Reject</option>
                            </select>
                        </label>
                    `).join("")}
                    <button type="submit" class="button button-accept button-full">Save subject decisions</button>
                </form>
                </div>
            </details>
            <button type="button" class="text-button admin-close-review">Close application</button>
    `;

    let saving = false;
    const feedback = detail.querySelector('[role="status"]');
    async function saveDecision(decisions) {
        if (saving) return;
        saving = true;
        const user = window.currentUser;
        const controls = [...detail.querySelectorAll("button, select")];
        controls.forEach(control => { control.disabled = true; });
        feedback.textContent = "Saving decision...";
        try {
            await window.updateTutorApplicationDecision(applicationId, decisions);
            if (window.currentUser === user && window.isAdminUser?.()) {
                await loadAdminApplications(`Decision saved for ${name}.`);
            }
        } catch (error) {
            console.error("Application decision error:", error);
            feedback.textContent = error.message || "We couldn’t save the decision. Please try again.";
        } finally {
            saving = false;
            controls.forEach(control => { control.disabled = false; });
        }
    }

    detail.querySelectorAll("[data-decision]").forEach(button => {
        button.addEventListener("click", () => saveDecision(Object.fromEntries(
            subjects.map(subject => [subject, button.dataset.decision])
        )));
    });
    detail.querySelector("form").addEventListener("submit", event => {
        event.preventDefault();
        saveDecision(Object.fromEntries([...detail.querySelectorAll("[data-subject]")]
            .map(select => [select.dataset.subject, select.value])));
    });
    detail.querySelector(".admin-close-review").addEventListener("click", () => {
        setExpanded(false);
        reviewButton.focus();
    });
    setExpanded(true);
}

async function loadExistingTutors(message = "") {
    if (!window.currentUser || !window.isAdminUser?.()) {
        alert("Administrator access required.");
        goHome();
        return;
    }

    const user = window.currentUser;
    const version = ++adminLoadVersion;
    const container = document.getElementById("admin-tutors-content");
    container.textContent = "Loading tutors...";
    document.getElementById("admin-tutors-feedback").textContent = message;
    showScreen("admin-tutors-screen");

    try {
        const tutors = await window.getExistingTutors();
        if (window.currentUser !== user || version !== adminLoadVersion) return;
        tutors.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
        container.replaceChildren();
        if (!tutors.length) {
            container.innerHTML = `<div class="empty-state"><h3>No approved tutors yet.</h3><p>Approved tutors will appear here.</p></div>`;
            return;
        }
        renderTutorCards(tutors, container, true);
    } catch (error) {
        if (window.currentUser !== user || version !== adminLoadVersion) return;
        console.error("Existing tutors error:", error);
        container.textContent = "We couldn’t load tutors. Please refresh to try again.";
    }
}

if (new URLSearchParams(window.location.search).get("review") === "1") {
    requestAdminDashboard();
}

/* Scheduling and profile revisions. */
async function startTutorRegistration() {
    const user = window.currentUser;
    if (!user) return;
    try {
        const existing = await window.getMyTutorApplications();
        if (window.currentUser !== user) return;
        if (existing.length) { await loadMyApplications(); return; }
        resetTutorRegistration();
        showScreen("signup-screen");
    } catch (error) { alert("We couldn’t check your existing application. Please try again."); }
}

function editTutorApplication(application) {
    resetTutorRegistration();
    editingApplicationId = application.id;
    for (const [id, key] of [["tutor-first-name","firstName"],["tutor-last-name","lastName"],["tutor-grade","grade"],["tutor-bio","bio"],["tutor-max-students","maxStudents"],["tutor-hourly-rate","hourlyRate"],["tutor-phone","contactPhone"]]) {
        document.getElementById(id).value = application[key] ?? (key === "maxStudents" ? 1 : "");
    }
    document.getElementById("bio-character-count").textContent = application.bio.length;
    (application.subjects || []).forEach(subject => selectedTutorSubjects.add(subjectLabel(subject)));
    document.querySelectorAll('input[name="format"]').forEach(input => input.checked = application.formats.includes(input.value));
    document.querySelectorAll('input[name="rateType"]').forEach(input => input.checked = input.value === application.rateType);
    Object.entries(application.availability || {}).forEach(([day,times]) => { if (times.length) tutorAvailability[day] = new Set(times); });
    document.getElementById("tutor-contact").value = application.contactMethod || "";
    updateTutorContact();
    document.getElementById("tutor-share-contact").checked = Boolean(application.contactConsent || application.shareSchoolEmail);
    document.getElementById("tutor-use-google-photo").checked = Boolean(application.profilePhotoURL && window.getGoogleProfilePhoto?.());
    document.getElementById("tutor-guidelines").checked = false;
    updateGooglePhoto(); updateRateOptions(); renderTutorSubjects(); renderAvailabilityDays(); renderAvailabilityTimes(); updateAvailabilitySummary();
    document.getElementById("submit-application-button").textContent = "Save and send for review";
    document.getElementById("profile-edit-notice")?.classList.remove("hidden");
    showScreen("signup-screen");
}

function schoolDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Monterrey",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const part = type => parts.find(item => item.type === type).value;
    return part("year") + "-" + part("month") + "-" + part("day");
}
function formatSessionTime(session) {
    return new Intl.DateTimeFormat("en-US", {timeZone:"America/Monterrey",weekday:"short",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(session.startAt.toMillis()));
}
function addSessionRequestForm(tutor) {
    const container = document.getElementById("session-request-container");
    if (!tutor.userId) { container.innerHTML = "<p>Scheduling for this tutor will be available after the school reviewer updates their profile.</p>"; return; }
    if (tutor.userId === window.currentUser.uid) { container.innerHTML = '<p>This is your profile. Open <button class="text-button" onclick="openMySessions()">My sessions</button> to review requests.</p>'; return; }
    container.innerHTML = `<p class="input-hint">One student per booking · one hour · request up to 60 days ahead. Tutor contact details stay private until acceptance. Your school account name and email are shared privately with the tutor. Check My sessions for updates.</p>
        <form id="session-request-form" class="booking-form">
            <div class="booking-grid">
                <div class="form-field"><label for="booking-subject">Subject</label><select id="booking-subject" required>${tutor.subjects.map(value => '<option value="' + escapeHTML(value) + '">' + escapeHTML(subjectLabel(value)) + '</option>').join('')}</select></div>
                <div class="form-field"><label for="booking-format">Format</label><select id="booking-format" required>${tutor.formats.map(value => '<option>' + escapeHTML(value) + '</option>').join('')}</select></div>
                <div class="form-field"><label for="booking-date">Date (Tampico time)</label><input id="booking-date" type="date" required min="${schoolDate()}" max="${schoolDate(new Date(Date.now()+60*86400000))}"></div>
                <div class="form-field"><label for="booking-time">Available start time</label><select id="booking-time" required disabled><option value="">Choose a date first</option></select></div>
            </div>
            <div class="form-field"><label for="booking-topic">What would you like help with?</label><textarea id="booking-topic" required minlength="10" maxlength="500" rows="3" placeholder="For example: reviewing cell division for my biology exam."></textarea></div>
            <label class="checkbox-consent"><input id="booking-guidelines" type="checkbox" required><span>I will use this request for academic help, communicate respectfully, and meet only once the tutor accepts.</span></label>
            <p id="booking-feedback" role="status" aria-live="polite"></p>
            <button class="button button-primary" type="submit">Send session request</button>
        </form>`;
    document.getElementById("booking-subject").value = tutor.subjects.find(subject => subjectLabel(subject) === selectedSubject) || tutor.subjects[0];
    const date = document.getElementById("booking-date"), times = document.getElementById("booking-time");
    date.addEventListener("change", () => {
        times.replaceChildren();
        if (!date.value) { times.disabled = true; return; }
        const day = new Intl.DateTimeFormat("en-US",{timeZone:"America/Monterrey",weekday:"long"}).format(new Date(date.value+"T12:00:00-06:00"));
        const available = (tutor.availability?.[day] || []).filter(time => {
            try { return window.makeSchoolSlot(date.value,time).start > new Date(); } catch { return false; }
        });
        times.innerHTML = '<option value="">' + (available.length ? 'Choose a time' : 'No available times on this date') + '</option>' + available.map(time => '<option>' + escapeHTML(time) + '</option>').join('');
        times.disabled = !available.length;
    });
    const form = document.getElementById("session-request-form");
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]'), feedback = document.getElementById("booking-feedback");
        if (button.disabled) return;
        if (!times.value) { feedback.textContent = "Choose an available time."; return; }
        const user = window.currentUser;
        button.disabled = true; feedback.textContent = "Sending your request…";
        try {
            await window.requestTutoringSession({tutorId:tutor.id,date:date.value,time:times.value,subject:document.getElementById("booking-subject").value,format:document.getElementById("booking-format").value,topic:document.getElementById("booking-topic").value});
            if (window.currentUser !== user) return;
            document.getElementById("session-view").value = "student";
            openMySessions("Request sent. Wait for the tutor’s acceptance before meeting.");
        } catch(error) { if (window.currentUser === user) feedback.textContent = error.message || "We couldn’t send your request. Please try again."; }
        finally { button.disabled = false; }
    });
}

function startSessionUpdates() {
    stopWatchingSessions?.(); stopWatchingSessions = null;
    const version = ++sessionWatchVersion;
    mySessions = []; sessionsError = ""; busySessions.clear();
    document.getElementById("my-sessions-button").textContent = "My sessions";
    document.getElementById("session-feedback").textContent = "";
    const user = window.currentUser;
    if (!user || !window.watchMySessions) return;
    stopWatchingSessions = window.watchMySessions(items => {
        if (window.currentUser !== user || version !== sessionWatchVersion) return;
        mySessions = items;
        const pending = items.filter(item => item.tutorUid === user.uid && item.status === "pending" && item.startAt.toMillis() > Date.now()).length;
        document.getElementById("my-sessions-button").textContent = "My sessions" + (pending ? " (" + pending + ")" : "");
        if (document.getElementById("sessions-screen").classList.contains("active")) renderMySessions();
    }, error => {
        if (window.currentUser !== user || version !== sessionWatchVersion) return;
        console.error("Session updates unavailable:", error);
        sessionsError = "We couldn’t load session updates. Please refresh to try again.";
        if (document.getElementById("sessions-screen").classList.contains("active")) renderMySessions();
    });
}
function openMySessions(message = "") {
    if (!window.currentUser) { pendingFeature = "sessions"; showScreen("auth-screen"); return; }
    document.getElementById("session-feedback").textContent = message;
    showScreen("sessions-screen"); renderMySessions();
}
function refreshMySessions() { startSessionUpdates(); renderMySessions(); }
document.getElementById("session-view").addEventListener("change", renderMySessions);
function renderMySessions() {
    const container = document.getElementById("session-list");
    const drafts = new Map(Array.from(container.querySelectorAll('textarea[data-session]')).map(input => [input.dataset.session,input.value]));
    container.replaceChildren();
    if (!window.currentUser) return;
    if (sessionsError) { container.textContent = sessionsError; return; }
    const asTutor = document.getElementById("session-view").value === "tutor";
    const items = mySessions.filter(item => (asTutor ? item.tutorUid : item.studentUid) === window.currentUser.uid)
        .sort((a,b) => a.startAt.toMillis() - b.startAt.toMillis());
    if (!items.length) { container.innerHTML = '<div class="empty-state"><h3>No sessions yet.</h3><p>' + (asTutor ? 'Requests from students will appear here once your tutor profile is approved.' : 'Find a tutor and request an available time to get started.') + '</p></div>'; return; }
    items.forEach(session => {
        const future = session.startAt.toMillis() > Date.now();
        const status = !future && session.status === "pending" ? "Expired request" : !future && session.status === "accepted" ? "Past session" : {pending:"Awaiting tutor approval",accepted:"Confirmed",declined:"Declined",cancelled:"Cancelled"}[session.status] || session.status;
        const card = document.createElement("article"); card.className = "profile-card session-card";
        card.innerHTML = `<div class="session-heading"><h3>${escapeHTML(subjectLabel(session.subject))} with ${escapeHTML(asTutor ? session.studentName : session.tutorName)}</h3><span class="session-status status-${escapeHTML(session.status)}">${escapeHTML(status)}</span></div>
            ${asTutor ? '<p class="input-hint">School account: ' + escapeHTML(session.studentEmail) + '</p>' : ''}
            <p><strong>${escapeHTML(formatSessionTime(session))}</strong> · 1 hour · Tampico time</p>
            <p>${escapeHTML(session.format)} · ${session.rateType === "paid" ? 'MXN ' + escapeHTML(session.hourlyRate) + ' for this hour' : 'Free tutoring'}</p>
            <div class="session-topic"><h4>Help requested</h4><p>${escapeHTML(session.topic)}</p></div>
            ${session.status === "accepted" ? '<h4>Meeting details</h4><p class="meeting-details">'+escapeHTML(session.meetingDetails)+'</p>' : ''}
            <div class="session-controls"></div><p class="session-action-feedback" role="status" aria-live="polite"></p>`;
        const controls = card.querySelector('.session-controls');
        if (session.status === "accepted") {
            const contact = document.createElement('p');
            contact.textContent = asTutor ? "Student school email: " + session.studentEmail : session.tutorContactEmail ? "Tutor email: " + session.tutorContactEmail : session.tutorContactPhone ? "Tutor phone: " + session.tutorContactPhone : "The tutor has not shared contact details. Use the meeting details above.";
            controls.appendChild(contact);
            const calendar = document.createElement('button'); calendar.className = 'button button-secondary'; calendar.textContent = 'Add to calendar'; calendar.onclick = () => downloadSessionCalendar(session); controls.appendChild(calendar);
        }
        function action(label, decision, details = () => "") {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'button ' + (decision === 'accepted' ? 'button-approve' : 'button-secondary'); button.textContent = label; button.disabled = busySessions.has(session.id);
            button.addEventListener('click', async () => {
                if (busySessions.has(session.id)) return;
                if (decision === 'cancelled' && !window.confirm('Cancel this session request? The other student will see the cancellation in My sessions.')) return;
                const detail = details(); if (decision === 'accepted' && (detail.trim().length < 5 || detail.length > 250)) { card.querySelector('.session-action-feedback').textContent = 'Add meeting details in 5–250 characters.'; return; }
                busySessions.add(session.id); controls.querySelectorAll('button').forEach(item => item.disabled = true);
                const user = window.currentUser;
                try { await window.decideSessionRequest(session.id, decision, detail); if (window.currentUser === user) document.getElementById('session-feedback').textContent = 'Session ' + decision + '.'; }
                catch(error) { if (window.currentUser === user) document.getElementById('session-feedback').textContent = error.message || 'Couldn’t save this decision. Please try again.'; }
                finally { busySessions.delete(session.id); if (window.currentUser === user && document.getElementById('sessions-screen').classList.contains('active')) renderMySessions(); }
            }); controls.appendChild(button);
        }
        if (future && session.status === 'pending' && asTutor) {
            const label = document.createElement('label'); label.textContent = 'Meeting place or online meeting link'; label.htmlFor = 'meeting-' + session.id;
            const input = document.createElement('textarea'); input.id = label.htmlFor; input.dataset.session = session.id; input.maxLength = 250; input.rows = 2; input.placeholder = session.format === 'Online' ? 'Add an online meeting link and instructions.' : 'Choose an appropriate school meeting location.'; input.value = drafts.get(session.id) || '';
            controls.append(label,input); action('Accept request','accepted',()=>input.value); action('Decline request','declined');
        }
        if (future && ['pending','accepted'].includes(session.status)) action('Cancel ' + (session.status === 'accepted' ? 'session' : 'request'),'cancelled');
        container.appendChild(card);
    });
}
function downloadSessionCalendar(session) {
    const stamp = value => new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const clean = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,match=>'\\'+match);
    const body = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ATS Tutoring//Sessions//EN','BEGIN:VEVENT','UID:'+session.id+'@ats-tutoring','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(session.startAt.toMillis()),'DTEND:'+stamp(session.startAt.toMillis()+3600000),'SUMMARY:'+clean('ATS Tutoring: '+session.subject),'DESCRIPTION:'+clean('Tutor: '+session.tutorName+'; Student: '+session.studentName),'LOCATION:'+clean(session.meetingDetails),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([body],{type:'text/calendar;charset=utf-8'})); link.href = url; link.download = 'ats-tutoring-session.ics'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
