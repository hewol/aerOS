/* eslint-disable jsdoc/require-jsdoc */

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Dialog from 'resource:///org/gnome/shell/ui/dialog.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {BaseMenuLayout} from './baseMenuLayout.js';
import * as Constants from '../constants.js';
import * as MW from '../menuWidgets.js';
import * as Utils from '../utils.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

function _getFolderName(folder) {
    const name = folder.get_string('name');

    if (folder.get_boolean('translate')) {
        const translated = Shell.util_get_translated_folder_name(name);
        if (translated !== null)
            return translated;
    }

    return name;
}

function _getCategories(info) {
    const categoriesStr = info.get_categories();
    if (!categoriesStr)
        return [];
    return categoriesStr.split(';');
}

function _listsIntersect(a, b) {
    for (const itemA of a) {
        if (b.includes(itemA))
            return true;
    }
    return false;
}

function _findBestFolderName(apps) {
    const appInfos = apps.map(app => app.get_app_info());

    const categoryCounter = {};
    const commonCategories = [];

    appInfos.reduce((categories, appInfo) => {
        for (const category of _getCategories(appInfo)) {
            if (!(category in categoryCounter))
                categoryCounter[category] = 0;

            categoryCounter[category] += 1;

            // If a category is present in all apps, its counter will
            // reach appInfos.length
            if (category.length > 0 &&
                categoryCounter[category] === appInfos.length)
                categories.push(category);
        }
        return categories;
    }, commonCategories);

    for (const category of commonCategories) {
        const directory = `${category}.directory`;
        const translated = Shell.util_get_translated_folder_name(directory);
        if (translated !== null)
            return translated;
    }

    return null;
}

export const Layout = class PopLayout extends BaseMenuLayout {
    static {
        GObject.registerClass(this);
    }

    constructor(menuButton) {
        super(menuButton, {
            has_search: true,
            display_type: Constants.DisplayType.GRID,
            search_display_type: Constants.DisplayType.GRID,
            column_spacing: 12,
            row_spacing: 12,
            default_menu_width: 1050,
            vertical: true,
            icon_grid_size: Constants.GridIconSize.EXTRA_LARGE,
            category_icon_size: Constants.MEDIUM_ICON_SIZE,
            apps_icon_size: Constants.EXTRA_LARGE_ICON_SIZE,
            quicklinks_icon_size: Constants.MEDIUM_ICON_SIZE,
            buttons_icon_size: Constants.LARGE_ICON_SIZE,
            pinned_apps_icon_size: Constants.MEDIUM_ICON_SIZE,
        });

        this.draggableApps = true;
        this.topBox = new St.BoxLayout({
            x_expand: true,
            y_expand: false,
            vertical: false,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.START,
        });
        this.topBox.add_child(this.searchEntry);

        // Applications Box - Contains Favorites, Categories or programs
        this.applicationsScrollBox = this._createScrollBox({
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
            style_class: this._disableFadeEffect ? '' : 'small-vfade',
        });
        this.applicationsBox = new St.BoxLayout({
            vertical: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.START,
        });
        this.applicationsScrollBox.add_actor(this.applicationsBox);

        const layout = new Clutter.GridLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            column_spacing: 6,
            row_spacing: 6,
        });
        this.categoriesContainer = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        this.categoriesGrid = new St.Widget({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: false,
            y_align: Clutter.ActorAlign.END,
            layout_manager: layout,
        });
        this.categoriesContainer.add_child(this.categoriesGrid);
        layout.hookup_style(this.categoriesGrid);

        const searchBarLocation = this._settings.get_enum('searchbar-default-top-location');
        if (searchBarLocation === Constants.SearchbarLocation.BOTTOM) {
            this.searchEntry.style = 'margin: 10px 220px;';
            this.topBox.style = 'padding-top: 0.5em;';

            const separator = new MW.ArcMenuSeparator(this, Constants.SeparatorStyle.MEDIUM,
                Constants.SeparatorAlignment.HORIZONTAL);
            this.add_child(this.categoriesContainer);
            this.categoriesContainer.set({
                y_align: Clutter.ActorAlign.START,
                y_expand: false,
            });
            this.add_child(separator);

            this.add_child(this.applicationsScrollBox);

            this.add_child(this.topBox);
        } else if (searchBarLocation === Constants.SearchbarLocation.TOP) {
            this.searchEntry.style = 'margin: 10px 220px;';
            this.topBox.style = 'padding-bottom: 0.5em;';
            this.add_child(this.topBox);

            this.add_child(this.applicationsScrollBox);

            const separator = new MW.ArcMenuSeparator(this, Constants.SeparatorStyle.MEDIUM,
                Constants.SeparatorAlignment.HORIZONTAL);
            this.categoriesContainer.insert_child_at_index(separator, 0);
            this.add_child(this.categoriesContainer);
        }

        this._redisplayWorkId = Main.initializeDeferredWork(this, () => {
            this.reloadApplications(true);
        });

        this._folderSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
        this._folderSettings.connectObject('changed::folder-children', () =>
            Main.queueDeferredWork(this._redisplayWorkId), this);
        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._parentalControlsManager.connectObject('app-filter-changed',
            () => Main.queueDeferredWork(this._redisplayWorkId), this);

        this.updateWidth();
        this.loadCategories();
        this.setDefaultMenuView();
        global.settings.connectObject('changed::app-picker-layout',
            this.syncLibraryHomeAppList.bind(this), this);

        this._settings.connectObject('changed::pop-default-view', () => this.setDefaultMenuView(), this);
    }

    updateWidth(setDefaultMenuView) {
        const widthAdjustment = this._settings.get_int('menu-width-adjustment');
        let menuWidth = this.default_menu_width + widthAdjustment;
        // Set a 300px minimum limit for the menu width
        menuWidth = Math.max(300, menuWidth);
        this.applicationsScrollBox.style = `width: ${menuWidth}px;`;
        this.menu_width = menuWidth;

        if (setDefaultMenuView)
            this.setDefaultMenuView();
    }

    loadCategories() {
        this.categoriesGrid.destroy_all_children();
        this.categoryDirectories = null;
        this.categoryDirectories = new Map();

        this.applicationsMap = new Map();

        this._appInfoList = Shell.AppSystem.get_default().get_installed().filter(appInfo => {
            try {
                appInfo.get_id(); // catch invalid file encodings
            } catch (e) {
                return false;
            }
            return this._parentalControlsManager.shouldShowApp(appInfo);
        });

        this.loadGroups();
    }

    _syncFolder(folderMenuItem) {
        const {folderSettings} = folderMenuItem;
        const name = _getFolderName(folderSettings);

        const foldersData = this._settings.get_value('pop-folders-data').deep_unpack();
        const folderEntryId = folderMenuItem.folder_id;
        foldersData[folderEntryId] = name;
        this._settings.set_value('pop-folders-data', new GLib.Variant('a{ss}', foldersData));

        this._loadFolderApps(folderMenuItem);
        folderMenuItem.folder_name = name;
        folderMenuItem.createIcon();

        if (this.activeCategoryItem === folderMenuItem)
            folderMenuItem.displayAppList();
    }

    loadGroups() {
        const foldersData = {'Library Home': _('Library Home')};
        const homeGroupMenuItem = new GroupFolderMenuItem(this, null, {
            folder_name: _('Library Home'),
            home_folder: true,
        });
        this.categoryDirectories.set('Library Home', homeGroupMenuItem);

        let usedApps = [];

        const folders = this._folderSettings.get_strv('folder-children');
        folders.forEach(id => {
            const path = `${this._folderSettings.path}folders/${id}/`;
            const folderSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.app-folders.folder',
                path,
            });

            const name = _getFolderName(folderSettings);
            const categoryMenuItem = new GroupFolderMenuItem(this, folderSettings, {
                folder_name: name,
                folder_id: id,
            });
            this._loadFolderApps(categoryMenuItem);

            // Don't display empty folders
            if (categoryMenuItem.appList.length > 0) {
                foldersData[id] = name;
                this.categoryDirectories.set(id, categoryMenuItem);

                usedApps = usedApps.concat(categoryMenuItem.appList);

                folderSettings.connectObject('changed', () =>
                    this._syncFolder(categoryMenuItem), categoryMenuItem);
            } else {
                categoryMenuItem.destroy();
            }
        });

        this._settings.set_value('pop-folders-data', new GLib.Variant('a{ss}', foldersData));

        const remainingApps = [];
        const apps = this._appInfoList.map(app => app.get_id());
        apps.forEach(appId => {
            const app = Shell.AppSystem.get_default().lookup_app(appId);

            if (!this.applicationsMap.get(app)) {
                const item = new MW.ApplicationMenuItem(this, app, this.display_type);
                item.setFolderGroup(homeGroupMenuItem);
                this.applicationsMap.set(app, item);
                remainingApps.push(app);
            }
        });
        remainingApps.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });
        homeGroupMenuItem.appList = remainingApps;

        this.placeHolderFolderItem = new GroupFolderMenuItem(this, null, {
            folder_name: _('New Folder'),
            new_folder: true,
        });
        this.categoryDirectories.set('New Folder', this.placeHolderFolderItem);
        this.placeHolderFolderItem.set({
            visible: false,
            opacity: 0,
            scale_x: 0,
            scale_y: 0,
        });
        this.displayCategories();
    }

    createNewFolder(app) {
        const newFolderId = GLib.uuid_string_random();

        const folders = this._folderSettings.get_strv('folder-children');
        folders.push(newFolderId);

        const newFolderPath = this._folderSettings.path.concat('folders/', newFolderId, '/');
        let newFolderSettings;
        try {
            newFolderSettings = new Gio.Settings({
                schema_id: 'org.gnome.desktop.app-folders.folder',
                path: newFolderPath,
            });
        } catch (e) {
            log('Error creating new folder');
            return;
        }

        const appIds = [app.id];
        let folderName = _findBestFolderName([app]);
        if (!folderName)
            folderName = _('Unnamed Folder');

        newFolderSettings.delay();
        newFolderSettings.set_string('name', folderName);
        newFolderSettings.set_strv('apps', appIds);
        newFolderSettings.apply();

        this._folderSettings.set_strv('folder-children', folders);
    }

    removeFolder(folderMenuItem) {
        const {folderSettings, folder_id: folderId} = folderMenuItem;

        // Resetting all keys deletes the relocatable schema
        const keys = folderSettings.settings_schema.list_keys();
        for (const key of keys)
            folderSettings.reset(key);

        const settings = new Gio.Settings({schema_id: 'org.gnome.desktop.app-folders'});
        const folders = settings.get_strv('folder-children');
        folders.splice(folders.indexOf(folderId), 1);
        settings.set_strv('folder-children', folders);
    }

    removeAppFromFolder(app, folder) {
        if (!folder)
            return;

        const appId = app.id;
        const isHomeFolder = folder.home_folder;
        const folderAppList = folder.appList;

        const isAppInFolder = folderAppList.includes(app);
        if (isAppInFolder && !isHomeFolder) {
            const {folderSettings} = folder;
            const folderApps = folderSettings.get_strv('apps');
            const index = folderApps.indexOf(appId);

            if (index >= 0)
                folderApps.splice(index, 1);

            if (folderApps.length === 0) {
                this.removeFolder(folder);
            } else {
                const categories = folderSettings.get_strv('categories');
                if (categories.length > 0) {
                    const excludedApps = folderSettings.get_strv('excluded-apps');
                    excludedApps.push(appId);
                    folderSettings.set_strv('excluded-apps', excludedApps);
                }
                folderSettings.set_strv('apps', folderApps);
            }
        }
    }

    addAppToFolder(app, folder) {
        const appId = app.id;

        if (folder.home_folder)
            return;

        const {folderSettings} = folder;
        const folderApps = folderSettings.get_strv('apps');
        folderApps.push(appId);
        folderSettings.set_strv('apps', folderApps);

        const excludedApps = folderSettings.get_strv('excluded-apps');
        const index = excludedApps.indexOf(appId);
        if (index >= 0) {
            excludedApps.splice(index, 1);
            folderSettings.set_strv('excluded-apps', excludedApps);
        }
    }

    reorderFolderApps(folder, appList) {
        const {folderSettings} = folder;
        folderSettings.set_strv('apps', appList);
    }

    syncLibraryHomeAppList() {
        const layout = global.settings.get_value('app-picker-layout');
        const appPages = layout.recursiveUnpack();
        const appSys = Shell.AppSystem.get_default();

        const appList = [];
        for (const page of appPages) {
            for (const [appId, properties_] of Object.entries(page)) {
                const app = appSys.lookup_app(appId);
                if (app)
                    appList.push(app);
            }
        }
        appList.sort((a, b) => {
            return a.get_name().toLowerCase() > b.get_name().toLowerCase();
        });

        const folder = this.categoryDirectories.get('Library Home');
        folder.appList = appList;
        if (this.activeCategoryItem === folder)
            folder.displayAppList();
    }

    reorderFolders(orderedList) {
        const orderedFolders = [];
        orderedList.forEach(child => {
            if (child.folder_id)
                orderedFolders.push(child.folder_id);
        });
        this._folderSettings.set_strv('folder-children', orderedFolders);
    }

    _loadFolderApps(folderMenuItem) {
        const {folderSettings} = folderMenuItem;
        const apps = [];
        const excludedApps = folderSettings.get_strv('excluded-apps');
        const appSys = Shell.AppSystem.get_default();
        const addAppId = appId => {
            if (excludedApps.includes(appId))
                return;

            const app = appSys.lookup_app(appId);
            if (!app)
                return;

            if (!this._parentalControlsManager.shouldShowApp(app.get_app_info()))
                return;

            if (apps.indexOf(app) !== -1)
                return;

            apps.push(app);
        };

        const folderApps = folderSettings.get_strv('apps');
        folderApps.forEach(addAppId);

        const folderCategories = folderSettings.get_strv('categories');
        const appInfos = this._appInfoList;

        appInfos.forEach(appInfo => {
            const appCategories = _getCategories(appInfo);
            if (!_listsIntersect(folderCategories, appCategories))
                return;

            addAppId(appInfo.get_id());
        });

        const items = [];
        apps.forEach(app => {
            let item = this.applicationsMap.get(app);
            if (!item) {
                item = new MW.ApplicationMenuItem(this, app, this.display_type);
                this.applicationsMap.set(app, item);
            }
            item.setFolderGroup(folderMenuItem);

            items.push(app);
        });

        folderMenuItem.appList = items;
    }

    fadeInPlaceHolder() {
        this.placeHolderFolderItem.visible = true;
        this.placeHolderFolderItem.ease({
            opacity: 255,
            duration: 200,
            scale_x: 1,
            scale_y: 1,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    fadeOutPlaceHolder() {
        this.placeHolderFolderItem.ease({
            opacity: 0,
            scale_x: 0,
            scale_y: 0,
            duration: 200,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.placeHolderFolderItem.visible = false;
            },
        });
    }

    displayCategories() {
        const gridIconPadding = 10;
        const iconWidth = 110 + gridIconPadding;

        const padding = 12;
        const totalWidth = this.menu_width - padding;
        const spacing = this.categoriesGrid.layout_manager.column_spacing;
        const columns = Math.floor(totalWidth / (iconWidth + spacing));
        this.categoriesGrid.layout_manager.gridColumns = columns;

        this._futureActiveItem = false;

        const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        let count = 0;
        let top = -1;
        let left = 0;

        for (const categoryMenuItem of this.categoryDirectories.values()) {
            if (categoryMenuItem.get_parent())
                continue;
            if (!rtl && (count % columns === 0)) {
                top++;
                left = 0;
            } else if (rtl && (left === 0)) {
                top++;
                left = columns;
            }

            this.categoriesGrid.layout_manager.attach(categoryMenuItem, left, top, 1, 1);
            categoryMenuItem.gridLocation = [left, top];
            if (!rtl)
                left++;
            else
                left--;
            count++;
            if (!this._futureActiveItem)
                this._futureActiveItem = categoryMenuItem;
        }

        this.activeMenuItem = this._futureActiveItem;
    }

    setDefaultMenuView() {
        super.setDefaultMenuView();
        const defaultView = this._settings.get_string('pop-default-view');
        let category = this.categoryDirectories.get(defaultView);

        if (!category)
            category = this.categoryDirectories.values().next().value;

        category.displayAppList();
        this.setActiveCategory(category, true);
    }

    _onSearchEntryChanged(searchEntry, searchString) {
        super._onSearchEntryChanged(searchEntry, searchString);
        if (!searchEntry.isEmpty())
            this.activeCategoryType = Constants.CategoryType.SEARCH_RESULTS;
    }
};

class GroupFolderMenuItem extends MW.ArcMenuPopupBaseMenuItem {
    static [GObject.properties] = {
        'folder-name': GObject.ParamSpec.string('folder-name', 'folder-name', 'folder-name',
            GObject.ParamFlags.READWRITE, ''),
        'folder-id': GObject.ParamSpec.string('folder-id', 'folder-id', 'folder-id',
            GObject.ParamFlags.READWRITE, ''),
        'home-folder': GObject.ParamSpec.boolean('home-folder', 'home-folder', 'home-folder',
            GObject.ParamFlags.READWRITE, false),
        'new-folder': GObject.ParamSpec.boolean('new-folder', 'new-folder', 'new-folder',
            GObject.ParamFlags.READWRITE, false),
    };

    static [GObject.signals] = {
        'folder-moved': {},
        'app-moved': {},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, folderSettings, params = {}) {
        super(menuLayout);
        this.set(params);
        this.pivot_point = new Graphene.Point({x: 0.5, y: 0.5});
        this.folderSettings = folderSettings;
        this.hasContextMenu = true;
        this.add_style_class_name('ArcMenuIconGrid ArcMenuGroupFolder');
        this.set({
            vertical: true,
            x_expand: false,
            tooltipLocation: Constants.TooltipLocation.BOTTOM_CENTERED,
            style: `width: ${110}px; height: ${72}px;`,
        });
        this._delegate = this;

        this._appList = [];
        this._name = '';

        this._iconBin = new St.Bin({
            y_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
        });
        this.add_child(this._iconBin);

        this.label = new St.Label({
            text: this._name,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.label_actor = this.label;
        this.add_child(this.label);

        this._updateIcon();
        this.remove_action(this._panAction);

        if (!this.home_folder) {
            this.remove_action(this._clickAction);
            this.draggable = true;
            this._draggable = DND.makeDraggable(this, {timeoutThreshold: 400});
            this._draggable.addClickAction(this._clickAction);
            this._draggable._animateDragEnd = eventTime => {
                this._draggable._animationInProgress = true;
                this._draggable._onAnimationComplete(this._draggable._dragActor, eventTime);
            };
            this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
            this._draggable.connect('drag-end', this._onDragEnd.bind(this));
        }

        if (!this._settings.get_boolean('multi-lined-labels'))
            return;

        this._iconBin?.set({
            y_align: Clutter.ActorAlign.TOP,
            y_expand: false,
        });

        const clutterText = this.label.get_clutter_text();
        clutterText.set({
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });
    }

    popupContextMenu() {
        if (this.home_folder)
            return;
        if (this.tooltip)
            this.tooltip.hide();

        if (this.contextMenu === undefined) {
            this.contextMenu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            this.contextMenu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen)
                    this.add_style_pseudo_class('active');
                else  if (!this.isActiveCategory)
                    this.remove_style_pseudo_class('active');
            });
            this.contextMenu.actor.add_style_class_name('arcmenu-menu app-menu');
            Main.uiGroup.add_child(this.contextMenu.actor);
            this._menuLayout.contextMenuManager.addMenu(this.contextMenu);

            this.contextMenu.addAction(_('Rename Folder'), () => this._createRenameDialog());
            this.contextMenu.addAction(_('Delete Folder'), () => this._createDeleteDialog());
        }

        this.contextMenu.open(BoxPointer.PopupAnimation.FULL);
    }

    _createDeleteDialog() {
        this.contextMenu.close();
        const dialog = new ModalDialog.ModalDialog();
        const content = new Dialog.MessageDialogContent({
            title: _('Permanently delete %s folder?').format(this.folder_name),
        });
        dialog.contentLayout.add_child(content);

        dialog.addButton({
            label: _('No'),
            action: () => {
                dialog.close();
            },
            default: true,
            key: Clutter.KEY_Escape,
        });
        dialog.addButton({
            label: _('Yes'),
            action: () => {
                this._menuLayout.removeFolder(this);
                dialog.close();
            },
            default: false,
            key: null,
        });
        dialog.open();
    }

    _createRenameDialog() {
        this.contextMenu.close();
        const dialog = new ModalDialog.ModalDialog();
        const content = new Dialog.MessageDialogContent({
            title: _('Rename %s folder').format(this.folder_name),
        });
        dialog.contentLayout.add_child(content);

        const entry = new St.Entry({
            style_class: 'folder-name-entry',
            text: this.folder_name,
            reactive: true,
            can_focus: true,
        });
        entry.clutter_text.set({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(entry);
        dialog.setInitialKeyFocus(entry);

        const saveName = () => {
            const newFolderName = entry.text.trim();

            if (newFolderName.length === 0 || newFolderName === this.folder_name) {
                dialog.close();
                return;
            }

            this.folderSettings.set_string('name', newFolderName);
            this.folderSettings.set_boolean('translate', false);
            dialog.close();
        };

        entry.clutter_text.set_selection(0, -1);
        entry.clutter_text.connect('activate', () => saveName());

        dialog.addButton({
            label: _('Cancel'),
            action: () => {
                dialog.close();
            },
            default: false,
            key: Clutter.KEY_Escape,
        });
        dialog.addButton({
            label: _('Apply'),
            action: () => saveName(),
            default: false,
            key: null,
        });
        dialog.open();
    }

    getDragActor() {
        return this.createIcon();
    }

    getDragActorSource() {
        return this;
    }

    _onDragBegin() {
        this.isDragging = true;
        if (this._menuButton.tooltipShowingID) {
            GLib.source_remove(this._menuButton.tooltipShowingID);
            this._menuButton.tooltipShowingID = null;
            this._menuButton.tooltipShowing = false;
        }
        if (this.tooltip) {
            this.tooltip.hide();
            this._menuButton.tooltipShowing = false;
        }

        if (this.contextMenu && this.contextMenu.isOpen)
            this.contextMenu.toggle();

        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this.opacity = 55;
    }

    _withinLeeways(x, y) {
        return x < 20 || x > this.width - 20 ||
            y < 20 || y > this.height - 20;
    }

    handleDragOver(source, _actor, x, y) {
        if (!(source instanceof MW.ApplicationMenuItem)) {
            this.setHovering(false);
            return DND.DragMotionResult.NO_DROP;
        }

        if (this._withinLeeways(x, y) || this.appList.includes(source._app)) {
            this.setHovering(false);
            return DND.DragMotionResult.CONTINUE;
        }

        this.setHovering(true);
        return DND.DragMotionResult.MOVE_DROP;
    }

    setHovering(hovering) {
        if (hovering)
            this.add_style_pseudo_class('drop');
        else
            this.remove_style_pseudo_class('drop');
    }

    acceptDrop(source) {
        this.setHovering(false);
        if (!(source instanceof MW.ApplicationMenuItem))
            return false;

        if (this.appList.includes(source._app))
            return false;

        const app = source._app;
        const {folderMenuItem} = source;

        if (this.new_folder) {
            this._menuLayout.removeAppFromFolder(app, folderMenuItem);
            this._menuLayout.createNewFolder(app);
            return true;
        }

        this._menuLayout.removeAppFromFolder(app, folderMenuItem);
        this._menuLayout.addAppToFolder(app, this);
        source.setFolderGroup(this);

        return true;
    }

    _onDragMotion(dragEvent) {
        const parent = this.get_parent();
        const layoutManager = parent.layout_manager;
        if (!(layoutManager instanceof Clutter.GridLayout))
            return DND.DragMotionResult.CONTINUE;

        const targetActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, dragEvent.x, dragEvent.y);
        if (!(targetActor instanceof GroupFolderMenuItem) || targetActor === this)
            return DND.DragMotionResult.CONTINUE;

        const isFirstFolder = targetActor.gridLocation[0] === 0 && targetActor.gridLocation[1] === 0;

        if (!isFirstFolder)
            Utils.reorderMenuItems(this, targetActor.gridLocation);

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragEnd() {
        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        this.opacity = 255;
        const parent = this.get_parent();
        const layoutManager = parent.layout_manager;
        if (layoutManager instanceof Clutter.GridLayout) {
            const orderedList = Utils.getOrderedGridChildren(parent);
            this._menuLayout.reorderFolders(orderedList);
        }
    }

    set appList(value) {
        this._appList = value;
        this._updateIcon();
    }

    get appList() {
        return this._appList;
    }

    createIcon() {
        const iconSize = 32;

        this._name = _(this.folder_name);
        this.label.text = _(this._name);

        if (!this.appList.length || this.home_folder) {
            const icon = new St.Icon({
                style_class: 'popup-menu-icon',
                icon_size: iconSize,
                icon_name: this.home_folder ? 'user-home-symbolic' : 'folder-directory-symbolic',
            });
            return icon;
        }

        const layout = new Clutter.GridLayout({
            row_homogeneous: true,
            column_homogeneous: true,
        });
        const icon = new St.Widget({
            layout_manager: layout,
            x_align: Clutter.ActorAlign.CENTER,
            style: `width: ${iconSize}px; height: ${iconSize}px;`,
        });

        const subSize = Math.floor(.4 * iconSize);

        const numItems = this.appList.length;
        const rtl = icon.get_text_direction() === Clutter.TextDirection.RTL;
        for (let i = 0; i < 4; i++) {
            const style = `width: ${subSize}px; height: ${subSize}px;`;
            const bin = new St.Bin({style});
            if (i < numItems)
                bin.child = this.appList[i].create_icon_texture(subSize);
            layout.attach(bin, rtl ? (i + 1) % 2 : i % 2, Math.floor(i / 2), 1, 1);
        }

        return icon;
    }

    displayAppList() {
        this._menuLayout.searchEntry?.clearWithoutSearchChangeEvent();
        this._menuLayout.activeCategoryName = this._name;

        this._menuLayout.displayCategoryAppList(this.appList, this._name);

        this._menuLayout.activeCategoryType = this._name;
    }

    activate(event) {
        super.activate(event);
        this._menuLayout.setActiveCategory(this);
        this.displayAppList();
    }
}
