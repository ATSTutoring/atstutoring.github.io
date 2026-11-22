/* ==================================
   ATS TUTORING — WEBSITE LOGIC
================================== */


/*
    SUBJECT DIRECTORY

    Add new subjects to this list whenever needed.
    They will automatically appear in the dropdown.
*/

const subjects = [
    "Chemistry",
    "Biology",
    "Physics",
    "Physical Science",

    "Historia de México",
    "World History",
    "Civismo",
    "U.S. History",

    "Español",
    "Expresión Oral",
    "Lectura y Redacción",
    "Literatura",

    "Algebra",
    "Trigonometry",
    "Analytical Geometry",
    "Calculus",

    "AP Biology",
    "AP Computer Science Principles",
    "AP Seminar",
    "AP Research",
    "AP Statistics",
    "AP Physics",
    "AP English Language and Composition",
    "AP English Literature",
    "AP Precalculus",
    "AP Calculus",

    "English",
    "American Literature",
    "Writing & Style",

    "Microeconomics",
    "Anatomy & Physiology",
    "Everyday Medicine",
    "SAT",
    "PAA (Tec, UDEM, etc.)"
];


/*
    APPLICATION STATE

    These variables remember what the student selected
    while moving between screens.
*/

let selectedSubject = "";
let studentName = "";

// Remembers which feature the user wants to access.
let pendingFeature = null;
// Stores applications retrieved for the admin dashboard.
let adminApplications = [];
let adminLoadVersion = 0;

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
        showScreen("signup-screen");
    }

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

    window.currentUser = user || null;
    document.getElementById("sign-out-button").classList.toggle("hidden", !user);
    if (!user) {
        adminApplications = [];
        adminLoadVersion++;
        for (const id of ["tutor-grid", "tutor-profile", "application-status-content",
            "admin-applications-content", "admin-application-detail", "admin-tutors-content",
            "admin-dashboard-feedback", "admin-tutors-feedback"]) {
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

    if (user && pendingFeature) {
        continueToFeature();
    }

    const protectedScreens = [
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

    return `<div class="tutor-avatar" aria-hidden="true">${escapeHTML(initials)}</div>`;
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
                    ${escapeHTML(subject)}
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
        `<span class="subject-tag">${escapeHTML(subject)}</span>`
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

    let contact = "<p>This tutor hasn’t shared a school email.</p>";
    if (/^[^@\s]+@ats\.edu\.mx$/i.test(tutor.contactEmail || "")) {
        const address = encodeURIComponent(tutor.contactEmail).replace("%40", "@");
        const subject = encodeURIComponent("ATS tutoring request for " + selectedSubject);
        contact = `<a class="button button-primary" href="mailto:${address}?subject=${subject}">Email tutor</a>`;
    }

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
                    Ask the tutor to confirm a time before meeting.
                </p>

                <div class="availability-list">
                    ${availability || "<p>No availability listed.</p>"}
                </div>

            </section>

            <section class="profile-section">

                <h3>Contact</h3>

                ${contact}

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

    document.getElementById("tutor-registration-form").reset();

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

        if (!validAvailability) {
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
                ${escapeHTML(subject)}
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


    const avatarHTML = getAvatar({ name: `${firstName} ${lastName}` });

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
            <p>School email</p>

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

        subjects: [...selectedTutorSubjects],

        formats,

        rateType,

        hourlyRate: rateType === "paid"
            ? Number(document.getElementById("tutor-hourly-rate").value)
            : null,

        availability,

        maxStudents: Number(capacityInput.value),

        contactMethod: "School email",
        shareSchoolEmail: document.getElementById("tutor-share-email").checked

    };

    const button = document.getElementById("submit-application-button");
    if (button.disabled || !applicationData.shareSchoolEmail) return;

    try {

        button.disabled = true;
        button.textContent = "Submitting...";

        const submitted = await window.submitTutorApplication(applicationData);
        if (window.currentUser !== user) return;

        alert(submitted
            ? "Your tutor application was submitted and is awaiting review."
            : "You already have a tutor application on file.");

        await loadMyApplications();

    } catch (error) {

        console.error("Application submission error:", error);

        alert(
            "We couldn't submit your application. Please try again."
        );

    } finally {

        button.disabled = false;
        button.textContent = "Submit application";

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
                        <strong>${escapeHTML(subject)}</strong>
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
    const detail = document.getElementById("admin-application-detail");
    const feedback = document.getElementById("admin-dashboard-feedback");
    document.getElementById("admin-review-layout").classList.remove("has-open-application");
    container.textContent = "Loading applications...";
    detail.replaceChildren();
    detail.classList.add("hidden");
    feedback.textContent = message;
    showScreen("admin-dashboard-screen");

    try {
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
            card.innerHTML = `
                <h3>${escapeHTML(application.firstName)} ${escapeHTML(application.lastName)}</h3>
                <p>Grade ${escapeHTML(application.grade)}</p>
                <p class="application-status">Awaiting approval</p>
                <p>${escapeHTML((application.subjects || []).join(", "))}</p>
                <button type="button" class="button button-secondary">Review application</button>
            `;
            card.querySelector("button").addEventListener("click", () => openAdminApplication(application.id));
            container.appendChild(card);
        });
    } catch (error) {
        if (window.currentUser !== user || version !== adminLoadVersion) return;
        console.error("Admin dashboard error:", error);
        container.innerHTML = `<div class="empty-state"><h3>Unable to load applications.</h3><p>Please refresh to try again.</p></div>`;
    }
}

function openAdminApplication(applicationId) {
    if (!window.isAdminUser?.()) return;
    const application = adminApplications.find(item => item.id === applicationId);
    if (!application || application.status !== "pending") return;

    const name = `${application.firstName} ${application.lastName}`;
    const detail = document.getElementById("admin-application-detail");
    const subjects = application.subjects || [];
    const availability = Object.entries(application.availability || {})
        .filter(([, times]) => Array.isArray(times) && times.length > 0)
        .map(([day, times]) => `
        <p><strong>${escapeHTML(day)}</strong> ${escapeHTML(times.join(", "))}</p>
    `).join("");
    const rate = application.rateType === "paid"
        ? `MXN $${escapeHTML(application.hourlyRate)} per hour` : "Free tutoring";

    detail.innerHTML = `
        <article class="profile-card admin-review-card">
            <div class="admin-review-heading">
            <div>
            <h2>${escapeHTML(name)}</h2>
            <p>Grade ${escapeHTML(application.grade)}</p>
            </div>
            <p class="application-status">Awaiting approval</p>
            </div>
            <p class="admin-subject-intro">${escapeHTML(name)} is requesting being a tutor for the following subjects:</p>
            <div class="subject-tags">${subjects.map(subject => `<span class="subject-tag">${escapeHTML(subject)}</span>`).join("")}</div>
            <div class="admin-decision-actions">
                <button type="button" class="button button-accept" data-decision="approved">Accept for all subjects</button>
                <button type="button" class="button button-danger" data-decision="rejected">Reject for all subjects</button>
            </div>
            <p class="admin-feedback" role="status" aria-live="polite"></p>
            <details class="admin-review-details">
                <summary>View more details and decide by subject</summary>
                <div class="admin-details-layout">
                <div class="admin-metadata">
                <div class="review-detail admin-metadata-wide"><h4>About the applicant</h4><p>${escapeHTML(application.bio)}</p></div>
                <div class="review-detail"><h4>School email</h4><p>${escapeHTML(application.applicantEmail)}</p></div>
                <div class="review-detail"><h4>Tutoring formats</h4><p>${escapeHTML((application.formats || []).join(", "))}</p></div>
                <div class="review-detail"><h4>Tutoring rate</h4><p>${rate}</p></div>
                <div class="review-detail admin-metadata-wide"><h4>Availability</h4>${availability || "<p>Not provided.</p>"}</div>
                <div class="review-detail"><h4>Maximum students per session</h4><p>${escapeHTML(application.maxStudents ?? "Not provided")}</p></div>
                <div class="review-detail"><h4>Preferred contact method</h4><p>${escapeHTML(application.contactMethod || "Not provided")}</p></div>
                </div>
                <form class="admin-subject-decisions">
                    <h4>Decide by subject</h4>
                    ${subjects.map(subject => `
                        <label class="form-field">
                            <span>${escapeHTML(subject)}</span>
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
        </article>
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
    const layout = document.getElementById("admin-review-layout");
    detail.querySelector(".admin-close-review").addEventListener("click", () => {
        detail.classList.add("hidden");
        layout.classList.remove("has-open-application");
    });
    layout.classList.add("has-open-application");
    detail.classList.remove("hidden");
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
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
