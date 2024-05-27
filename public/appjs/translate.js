const localLang = localStorage.getItem('language') ?? navigator.language.split('-')[0];

function updateElementText(element, newText) {
    if (element.hasChildNodes()) {
        let hasOnlyTextNodes = Array.from(element.childNodes).every(node => node.nodeType === Node.TEXT_NODE);

        if (hasOnlyTextNodes) {
            // If all child nodes are text, replace the whole text content
            element.textContent = newText;
        } else {
            // If there are mixed nodes, replace only the direct text node
            let textNode = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (textNode) textNode.nodeValue = newText;
        }
    } else {
        // If no child nodes, just update the text content
        element.textContent = newText;
    }
}

const getLang = async () => {
    const response = await fetch(`/dist/locales/${localLang}.json`);
    const data = await response.json();
    return data;
}

/**
 * Shows the current total of the cart in the NAV Bar
 */
const displayCartOverview = () => {
    if(document.getElementById('CartHeaderElementAmount') == null) return;
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    let totalItems = 0;
    let totalPrice = 0;

    cart.forEach(cartItem => {
        totalItems += Number(cartItem.amount);
        totalPrice += Number(cartItem.totalPrice);
    });

    console.log(`Total items: ${totalItems}, Total price: ${totalPrice}`);

    // Example logic to update the UI with the cart overview
    document.getElementById('CartHeaderElementAmount').innerText = i18next.t('Shop.Toal_Items', { count: totalItems });
    document.getElementById('CartHeaderElementCost').innerText = i18next.t('Shop.Total_Price', { count: totalPrice });
}

document.addEventListener("DOMContentLoaded", async () => {
    const langFile = await getLang();
    i18next.init({
        lng: localLang,
        debug: true,
        resources: {
            [localLang]: {
                translation: langFile
            }
        }
    });

    if (localStorage.getItem('token') != null) {
        fetch('/api/v1/user/credit', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            }
        }).then(response => response.json()).then(data => {
            if (data.credit != undefined) {
                document.getElementById('UserCreditamount').innerText = i18next.t('Dashboard.Header.Buttons.Credit', { count: Number(data.credit) });
            }
        }).catch((error) => {
            console.error('Error:', error);
        });

        if (document.getElementById('CartHeaderElementAmount') != null) displayCartOverview(); // Display the cart overview
    }

    /* Translate all elements marked with spesific html tags */
    document.querySelectorAll("[data-translate]").forEach((element) => {
        const key = element.getAttribute("data-translate");
        if (key) {
            updateElementText(element, i18next.t(key));
        }
    });

    // Translate placeholders
    document.querySelectorAll("[data-translate-placeholder]").forEach((element) => {
        const key = element.getAttribute("data-translate-placeholder");
        if (key) {
            element.setAttribute('placeholder', i18next.t(key));
        }
    });

    // Translate title
    document.querySelectorAll("[data-translate-title]").forEach((element) => {
        const key = element.getAttribute("data-translate-title");
        if (key) {
            element.setAttribute('title', i18next.t(key));
        }
    });

    /* Generate a translated layout */
    if (localStorage.getItem('user_group') != undefined) {
        if (document.getElementById('Dashboard.Profile.User_Group') != undefined) {
            document.getElementById('Dashboard.Profile.User_Group').innerHTML = i18next.t(`User_Groups.${localStorage.getItem('user_group')}`);
        }
    }

    // Generate the Profile dropdown
    if (document.getElementById('Dashboard.ProfileDropdown') != undefined) {
        const dropdown = document.getElementById('Dashboard.ProfileDropdown');

        if (checkPermission('app.user.settings.*').result) {
            dropdown.innerHTML += `<a href="/settings-account" class="dropdown-item">${i18next.t('Dashboard.Header.Profile.Settings')}</a>`;
        }
        dropdown.innerHTML += `<div class="dropdown-divider"></div>`;
        if (checkPermission('app.web.logout').result) {
            dropdown.innerHTML += `<a onClick="logout()" class="dropdown-item">${i18next.t('Dashboard.Header.Profile.Logout')}</a>`;
        }
    }

    // Generate Navbar
    if (document.getElementById('Dashboard.Navbar.Elements') != undefined) {
        const navbar = document.getElementById('Dashboard.Navbar.Elements');

        // Add Home
        navbar.innerHTML += `
        <li class="nav-item">
            <a class="nav-link" href="/index" >
            <span class="nav-link-icon d-md-none d-lg-inline-block">
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-briefcase-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9z" /><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" /></svg></span>
                <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.Home')}</span>
            </a>
        </li>`

        // Add orders list (User)
        if (checkPermission('app.shop.user.orders.*').result) {
            navbar.innerHTML += `
            <li class="nav-item">
                <a class="nav-link" href="/orders" >
                <span class="nav-link-icon d-md-none d-lg-inline-block">
                <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-truck-delivery"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" /><path d="M3 9l4 0" /></svg></span>
                    <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.YourOders')}</span>
                </a>
            </li>`
        }

        // Add orders list (Admin)
        if (checkPermission('app.shop.admin.orders.*').result) {
            navbar.innerHTML += `
            <li class="nav-item">
                <a class="nav-link" href="/admin/orders" >
                <span class="nav-link-icon d-md-none d-lg-inline-block">
                <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-truck-delivery"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" /><path d="M3 9l4 0" /></svg></span>
                    <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.AdminOders')}</span>
                </a>
            </li>`
        }

        // Add inventory list
        if (checkPermission('app.shop.admin.inventory.*').result) {
            navbar.innerHTML += `
            <li class="nav-item">
                <a class="nav-link" href="/admin/inventory" >
                <span class="nav-link-icon d-md-none d-lg-inline-block">
                <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-building-warehouse"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M3 21v-13l9 -4l9 4v13" /><path d="M13 13h4v8h-10v-6h6" /><path d="M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3" /></svg></span>
                    <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.AdminInventory')}</span>
                </a>
            </li>`
        }

        // Add users list
        if (checkPermission('app.shop.admin.users.*').result) {
            navbar.innerHTML += `
            <li class="nav-item">
                <a class="nav-link" href="/admin/userlist" >
                <span class="nav-link-icon d-md-none d-lg-inline-block">
                <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-users"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0 -3 -3.85" /></svg></span>
                    <span class="nav-link-title">${i18next.t('Dashboard.Header.Navbar.AdminUserManagment')}</span>
                </a>
            </li>`
        }
    }
});

// Maches a unique constraint error message and returns the column name and value
const extractUniqueConstraintError = (errorMessage) => {
    const regex = /Key \(([^)]+)\)=\(([^)]+)\)/;
    const match = errorMessage.match(regex);

    if (match) {
        const columnName = match[1];
        const columnValue = match[2];
        return {
            columnName,
            columnValue
        };
    } else {
        throw new Error("The error message does not match the expected pattern.");
    }
}