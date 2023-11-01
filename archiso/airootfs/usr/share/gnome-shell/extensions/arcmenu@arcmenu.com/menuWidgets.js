import AccountsService from 'gi://AccountsService';
import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GMenu from 'gi://GMenu';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Params from 'resource:///org/gnome/shell/misc/params.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {AppContextMenu} from './appMenu.js';
import * as Constants from './constants.js';
import * as Utils from './utils.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const GDateMenu = Main.panel.statusArea.dateMenu;
const GWeatherWidget = GDateMenu._weatherItem.constructor;
const GWorldClocksWidget = GDateMenu._clocksItem.constructor;

const INDICATOR_ICON_SIZE = 18;
const USER_AVATAR_SIZE = 28;

const TOOLTIP_SHOW_TIME = 150;
const TOOLTIP_HIDE_TIME = 100;

/**
 * @param {Constants.PowerType} powerType The power type to activate
 */
function activatePowerOption(powerType) {
    const systemActions = SystemActions.getDefault();

    switch (powerType) {
    case Constants.PowerType.POWER_OFF:
        systemActions.activatePowerOff();
        break;
    case Constants.PowerType.RESTART:
        systemActions.activateRestart();
        break;
    case Constants.PowerType.LOCK:
        systemActions.activateLockScreen();
        break;
    case Constants.PowerType.LOGOUT:
        systemActions.activateLogout();
        break;
    case Constants.PowerType.SUSPEND:
        systemActions.activateSuspend();
        break;
    case Constants.PowerType.SWITCH_USER:
        systemActions.activateSwitchUser();
        break;
    case Constants.PowerType.HYBRID_SLEEP:
        Utils.activateHibernateOrSleep(powerType);
        break;
    case Constants.PowerType.HIBERNATE:
        Utils.activateHibernateOrSleep(powerType);
        break;
    }
}

/**
 * @param {PowerMenuItem} powerMenuItem Bind visibility of the powermenu item
 */
export function bindPowerItemVisibility(powerMenuItem) {
    const {powerType} = powerMenuItem;
    const systemActions = SystemActions.getDefault();

    switch (powerType) {
    case Constants.PowerType.POWER_OFF:
        systemActions.bind_property('can-power-off', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.RESTART:
        systemActions.bind_property('can-restart', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.LOCK:
        systemActions.bind_property('can-lock-screen', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.LOGOUT:
        systemActions.bind_property('can-logout', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.SUSPEND:
        systemActions.bind_property('can-suspend', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.SWITCH_USER:
        systemActions.bind_property('can-switch-user', powerMenuItem, 'visible',
            GObject.BindingFlags.DEFAULT | GObject.BindingFlags.SYNC_CREATE);
        break;
    case Constants.PowerType.HYBRID_SLEEP:
        Utils.canHibernateOrSleep('CanHybridSleep', result => (powerMenuItem.visible = result));
        break;
    case Constants.PowerType.HIBERNATE:
        Utils.canHibernateOrSleep('CanHibernate', result => (powerMenuItem.visible = result));
        break;
    }
}

export class ArcMenuPopupBaseMenuItem extends St.BoxLayout {
    static [GObject.properties] = {
        'active': GObject.ParamSpec.boolean('active', 'active', 'active',
            GObject.ParamFlags.READWRITE,
            false),
        'sensitive': GObject.ParamSpec.boolean('sensitive', 'sensitive', 'sensitive',
            GObject.ParamFlags.READWRITE,
            true),
    };

    static [GObject.signals] =  {
        'activate': {param_types: [Clutter.Event.$gtype]},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, params) {
        params = Params.parse(params, {
            reactive: true,
            activate: true,
            hover: true,
            style_class: null,
            can_focus: true,
        });
        super({
            style_class: 'popup-menu-item arcmenu-menu-item',
            reactive: params.reactive,
            track_hover: params.reactive,
            can_focus: params.can_focus,
            accessible_role: Atk.Role.MENU_ITEM,
        });

        this.hasContextMenu = false;
        this._delegate = this;

        this._menuButton = menuLayout.menuButton;
        this._settings = menuLayout.settings;
        this._arcMenu = menuLayout.arcMenu;
        this._extension = menuLayout.extension;
        this._menuLayout = menuLayout;

        this.tooltipLocation = Constants.TooltipLocation.BOTTOM;
        this.shouldShow = true;
        this._parent = null;
        this._active = false;
        this._activatable = params.reactive && params.activate;
        this._sensitive = true;

        this.x_align = Clutter.ActorAlign.FILL;
        this.x_expand = true;

        if (!this._activatable)
            this.add_style_class_name('popup-inactive-menu-item');

        if (params.style_class)
            this.add_style_class_name(params.style_class);

        if (params.hover)
            this.connect('notify::hover', this._onHover.bind(this));
        if (params.reactive && params.hover)
            this.bind_property('hover', this, 'active', GObject.BindingFlags.SYNC_CREATE);

        const textureCache = St.TextureCache.get_default();
        textureCache.connectObject('icon-theme-changed', () => this._updateIcon(), this);

        this._panAction = new Clutter.PanAction({interpolate: true});
        this._panAction.connect('pan', this._onPan.bind(this));
        this.add_action(this._panAction);

        this._clickAction = new Clutter.ClickAction({
            enabled: this._activatable,
        });
        this._clickAction.connect('clicked', this._onClicked.bind(this));
        this._clickAction.connect('long-press', this._onLongPress.bind(this));
        this._clickAction.connect('notify::pressed', () => {
            if (this._clickAction.pressed)
                this.add_style_pseudo_class('active');
            else
                this.remove_style_pseudo_class('active');
        });
        this.add_action(this._clickAction);

        this.connect('destroy', () => this._onDestroy());
    }

    _onPan(action) {
        let parent = this.get_parent();
        while (!(parent instanceof St.ScrollView)) {
            if (!parent)
                return false;
            parent = parent.get_parent();
        }

        this._clickAction.release();

        return this._menuLayout._onPan(action, parent);
    }

    _onClicked(action) {
        const isPrimaryOrTouch = action.get_button() === Clutter.BUTTON_PRIMARY || action.get_button() === 0;
        if (isPrimaryOrTouch) {
            this.active = false;
            this._menuLayout.grab_key_focus();
            this.remove_style_pseudo_class('active');
            this.activate(Clutter.get_current_event());
        } else if (action.get_button() === Clutter.BUTTON_SECONDARY) {
            if (this.hasContextMenu)
                this.popupContextMenu();
            else
                this.remove_style_pseudo_class('active');
        } else if (action.get_button() === 8) {
            const backButton = this._menuLayout.backButton;
            if (backButton && backButton.visible) {
                this.active = false;
                this._menuLayout.grab_key_focus();
                this.remove_style_pseudo_class('active');
                backButton.activate(Clutter.get_current_event());
            }
        }
    }

    _onLongPress(action, theActor, state) {
        const isPrimaryOrTouch = action.get_button() === Clutter.BUTTON_PRIMARY || action.get_button() === 0;
        if (state === Clutter.LongPressState.QUERY)
            return isPrimaryOrTouch && this._menuLayout.arcMenu.isOpen && this.hasContextMenu;

        if (state === Clutter.LongPressState.ACTIVATE && isPrimaryOrTouch)
            this.popupContextMenu();

        return true;
    }

    _updateIcon() {
        if (this.isDestroyed)
            return;

        if (!this._iconBin || !this.createIcon)
            return;

        const icon = this.createIcon();
        if (icon)
            this._iconBin.set_child(icon);
    }

    get actor() {
        return this;
    }

    get active() {
        return this._active;
    }

    set active(active) {
        if (this.isDestroyed || !this.mapped)
            return;

        // Prevent a mouse hover event from setting a new active menu item, until next mouse move event.
        if (this.hover && this._menuLayout.blockHoverState) {
            this.hover = false;
            return;
        }

        const activeChanged = active !== this.active;
        if (activeChanged) {
            this._active = active;

            if (active) {
                const topSearchResult = this._menuLayout.searchResults?.getTopResult();
                if (topSearchResult)
                    topSearchResult.remove_style_pseudo_class('active');

                // track the active menu item for keyboard navigation
                if (this._menuLayout.activeMenuItem !== this)
                    this._menuLayout.activeMenuItem = this;

                this.add_style_class_name('selected');
                if (this.can_focus)
                    this.grab_key_focus();
            } else {
                this.remove_style_class_name('selected');
                if (!this.isActiveCategory)
                    this.remove_style_pseudo_class('active');
            }
            this.notify('active');
        }
    }

    setShouldShow() {
        // If a saved shortcut link is a desktop app, check if currently installed.
        // Do NOT display if application not found.
        if (this._command.endsWith('.desktop') && !Shell.AppSystem.get_default().lookup_app(this._command))
            this.shouldShow = false;
    }

    _onHover() {
        if (!this._menuLayout.blockHoverState && this.hover && (this.label || this.tooltipText)) {
            const tooltipTitle = this.label || this.tooltipText;
            let {description} = this;
            if (this._app)
                description = this._app.get_description();
            this._menuButton.tooltip.showTooltip(this, this.tooltipLocation, tooltipTitle,
                description, this._displayType ? this._displayType : -1);
        } else if (!this.hover || this._menuLayout.blockHoverState) {
            this._menuButton.tooltip.hide();
        }
    }

    vfunc_motion_event() {
        // Prevent a mouse hover event from setting a new active menu item, until next mouse move event.
        if (this._menuLayout.blockHoverState) {
            this._menuLayout.blockHoverState = false;
            this.hover = true;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_focus_in() {
        super.vfunc_key_focus_in();
        if (!this.hover)
            this._menuLayout._keyFocusIn(this);
        this.active = true;
    }

    vfunc_key_focus_out() {
        super.vfunc_key_focus_out();
        if (this.contextMenu && this.contextMenu.isOpen)
            return;

        this.active = false;
        this.hover = false;
    }

    activate(event) {
        this.emit('activate', event);
    }

    vfunc_key_press_event(event) {
        this._menuLayout.blockHoverState = true;
        if (global.focus_manager.navigate_from_event(Clutter.get_current_event()))
            return Clutter.EVENT_STOP;

        if (!this._activatable)
            return super.vfunc_key_press_event(event);

        let state = event.get_state();

        // if user has a modifier down (except capslock and numlock)
        // then don't handle the key press here
        state &= ~Clutter.ModifierType.LOCK_MASK;
        state &= ~Clutter.ModifierType.MOD2_MASK;
        state &= Clutter.ModifierType.MODIFIER_MASK;

        if (state)
            return Clutter.EVENT_PROPAGATE;

        const symbol = event.get_key_symbol();
        if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
            this.active = false;
            this._menuLayout.grab_key_focus();
            this.activate(Clutter.get_current_event());
            return Clutter.EVENT_STOP;
        } else if (symbol === Clutter.KEY_Menu && this.hasContextMenu) {
            this.popupContextMenu();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onDestroy() {
        this.isDestroyed = true;
    }
}

export class ArcMenuSeparator extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, separatorLength, separatorAlignment, text) {
        super({
            style_class: 'popup-separator-menu-item',
            reactive: false,
            can_focus: false,
        });
        this.reactive = true;

        this._settings = menuLayout.settings;

        this.label = new St.Label({
            text: text || '',
            style: 'font-weight: bold',
        });
        this.add_child(this.label);
        this.label_actor = this.label;

        this.label.connect('notify::text', this._syncLabelVisibility.bind(this));
        this._syncLabelVisibility();

        this._separator = new St.Widget({
            style_class: 'popup-separator-menu-item-separator separator-color-style',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._separator);

        if (separatorAlignment === Constants.SeparatorAlignment.HORIZONTAL) {
            this.style = 'padding: 0px 5px; margin: 6px 0px;';
            switch (separatorLength) {
            case Constants.SeparatorStyle.SHORT:
                this._separator.style = 'margin: 0px 45px;';
                break;
            case Constants.SeparatorStyle.MEDIUM:
                this._separator.style = 'margin: 0px 15px;';
                break;
            case Constants.SeparatorStyle.LONG:
                this._separator.style = 'margin: 0px 5px;';
                this.style = 'padding: 0px 5px; margin: 1px 0px;';
                break;
            case Constants.SeparatorStyle.MAX:
                this._separator.style = 'margin: 0px; padding: 0px;';
                break;
            case Constants.SeparatorStyle.HEADER_LABEL:
                this._separator.style = 'margin: 0px 20px 0px 10px;';
                this.style = 'padding: 5px 15px; margin: 6px 0px;';
                break;
            }
        } else if (separatorAlignment === Constants.SeparatorAlignment.VERTICAL) {
            if (separatorLength === Constants.SeparatorStyle.LONG) {
                this._separator.style = 'margin: 5px 0px; width: 1px;';
                this.style = 'padding: 5px 0px; margin: 1px 0px;';
            } else {
                this._syncVisibility();
                this._settings.connectObject('changed::vert-separator', this._syncVisibility.bind(this), this);
                this.style = 'padding: 0px 6px; margin: 6px 0px;';
                this._separator.style = 'margin: 0px; width: 1px; height: -1px;';
            }

            this.remove_child(this.label);
            this.x_expand = this._separator.x_expand = true;
            this.x_align = this._separator.x_align = Clutter.ActorAlign.CENTER;
            this.y_expand = this._separator.y_expand = true;
            this.y_align = this._separator.y_align = Clutter.ActorAlign.FILL;
        }
    }

    _syncLabelVisibility() {
        this.label.visible = this.label.text !== '';
    }

    _syncVisibility() {
        this._separator.visible = this._settings.get_boolean('vert-separator');
    }
}

export class ActivitiesMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout) {
        super(menuLayout);

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);

        this._updateIcon();

        this.label = new St.Label({
            text: _('Activities Overview'),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);
    }

    createIcon() {
        const IconSizeEnum = this._settings.get_enum('quicklinks-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, this._menuLayout.quicklinks_icon_size);

        return new St.Icon({
            icon_name: 'view-fullscreen-symbolic',
            style_class: 'popup-menu-icon',
            icon_size: iconSize,
        });
    }

    activate(event) {
        Main.overview.show();
        super.activate(event);
        this._menuLayout.arcMenu.toggle();
    }
}

export class Tooltip extends St.Label {
    static {
        GObject.registerClass(this);
    }

    constructor(menuButton) {
        super({
            name: 'ArcMenu_Tooltip',
            style_class: 'dash-label arcmenu-tooltip',
            opacity: 0,
        });
        const {clutterText} = this;
        clutterText.set({
            line_wrap: true,
            line_wrap_mode: Pango.WrapMode.WORD_CHAR,
        });

        this._menuButton = menuButton;
        this._settings = menuButton.settings;

        global.stage.add_child(this);
        this.hide();

        this._useTooltips = !this._settings.get_boolean('disable-tooltips');
        this._settings.connectObject('changed::disable-tooltips', this.disableTooltips.bind(this), this);
        this.connect('destroy', () => this._onDestroy());
    }

    showTooltip(sourceActor, location, titleLabel, description, displayType) {
        if (!sourceActor)
            return;
        if (this.sourceActor === sourceActor) {
            this._showTimeout(titleLabel, description, displayType);
            return;
        }
        this.sourceActor = sourceActor;
        this.location = location;

        this._showTimeout(titleLabel, description, displayType);
    }

    disableTooltips() {
        this._useTooltips = !this._settings.get_boolean('disable-tooltips');
    }

    _setToolTipText(titleLabel, description, displayType) {
        let isEllipsized, titleText;
        if (titleLabel instanceof St.Label) {
            const lbl = titleLabel.clutter_text;
            lbl.get_allocation_box();
            isEllipsized = lbl.get_layout().is_ellipsized();
            titleText = titleLabel.text.replace(/\n/g, ' ');
        } else {
            titleText = titleLabel;
        }

        this.text = '';

        if (displayType !== Constants.DisplayType.BUTTON) {
            if (isEllipsized && description) {
                const text = `<b>${titleText}</b>\n${description}`;
                this.clutter_text.set_markup(text);
            } else if (isEllipsized && !description) {
                this.text = titleText ?? '';
            } else if (!isEllipsized && description) {
                this.text = description ?? '';
            }
        } else if (displayType === Constants.DisplayType.BUTTON) {
            this.text = titleText ?? '';
        }

        return !!this.text;
    }

    _showTimeout(titleLabel, description, displayType) {
        if (this._useTooltips) {
            this._menuButton.tooltipShowingID = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 750, () => {
                const shouldShow = this._setToolTipText(titleLabel, description, displayType);

                if (!shouldShow) {
                    this._menuButton.tooltipShowingID = null;
                    return GLib.SOURCE_REMOVE;
                }

                this._show();
                this._menuButton.tooltipShowing = true;
                this._menuButton.tooltipShowingID = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _show() {
        if (!this.sourceActor)
            return;
        if (this._useTooltips) {
            this.opacity = 0;
            this.show();

            const [stageX, stageY] = this.sourceActor.get_transformed_position();

            const itemWidth  = this.sourceActor.allocation.x2 - this.sourceActor.allocation.x1;
            const itemHeight = this.sourceActor.allocation.y2 - this.sourceActor.allocation.y1;

            const labelWidth = this.get_width();
            const labelHeight = this.get_height();

            let x, y;
            const gap = 5;

            switch (this.location) {
            case Constants.TooltipLocation.BOTTOM_CENTERED:
                y = stageY + itemHeight + gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case Constants.TooltipLocation.TOP_CENTERED:
                y = stageY - labelHeight - gap;
                x = stageX + Math.floor((itemWidth - labelWidth) / 2);
                break;
            case Constants.TooltipLocation.BOTTOM:
            default:
                y = stageY + itemHeight + gap;
                x = stageX + gap;
                break;
            }

            // keep the label inside the screen
            const monitor = Main.layoutManager.findMonitorForActor(this.sourceActor);
            if (x - monitor.x < gap)
                x += monitor.x - x + gap;
            else if (x + labelWidth > monitor.x + monitor.width - gap)
                x -= x + labelWidth - (monitor.x + monitor.width) + gap;
            else if (y - monitor.y < gap)
                y += monitor.y - y + gap;
            else if (y + labelHeight > monitor.y + monitor.height - gap)
                y -= y + labelHeight - (monitor.y + monitor.height) + gap;

            this.set_position(x, y);
            this.ease({
                opacity: 255,
                duration: TOOLTIP_SHOW_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    hide(instantHide) {
        if (this._useTooltips) {
            if (this._menuButton.tooltipShowingID) {
                GLib.source_remove(this._menuButton.tooltipShowingID);
                this._menuButton.tooltipShowingID = null;
            }
            this.sourceActor = null;
            this.ease({
                opacity: 0,
                duration: instantHide ? 0 : TOOLTIP_HIDE_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => super.hide(),
            });
        }
    }

    _onDestroy() {
        if (this._menuButton.tooltipShowingID) {
            GLib.source_remove(this._menuButton.tooltipShowingID);
            this._menuButton.tooltipShowingID = null;
        }
        if (this.hoverID) {
            this.sourceActor.disconnect(this.hoverID);
            this.hoverID = null;
        }

        global.stage.remove_child(this);
    }
}

export class ArcMenuButtonItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, tooltipText, iconName, gicon) {
        super(menuLayout);
        this.set({
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'popup-menu-item arcmenu-button',
        });

        this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;
        this.tooltipText = tooltipText;
        this.iconName = iconName;
        this.gicon = gicon;
        this.toggleMenuOnClick = true;
        this._displayType = Constants.DisplayType.BUTTON;

        if (this.iconName !== null) {
            this._iconBin = new St.Bin();
            this.add_child(this._iconBin);

            this._updateIcon();
        }
    }

    createIcon(overrideIconSize) {
        const IconSizeEnum = this._settings.get_enum('button-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, this._menuLayout.buttons_icon_size);

        return new St.Icon({
            gicon: this.gicon ? this.gicon : Gio.icon_new_for_string(this.iconName),
            icon_size: overrideIconSize ? overrideIconSize : iconSize,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
    }

    setIconSize(size) {
        if (!this._iconBin)
            return;
        this._iconBin.set_child(this.createIcon(size));
    }

    activate(event) {
        if (this.toggleMenuOnClick)
            this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }
}

export class PowerOptionsBox extends St.ScrollView {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, vertical = false) {
        super({
            x_expand: false,
            overlay_scrollbars: true,
            clip_to_allocation: true,
        });

        this._settings = menuLayout.settings;

        this._orientation = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        const box = new St.BoxLayout({
            vertical,
            style: 'spacing: 6px;',
        });
        this.add_actor(box);

        const powerOptions = this._settings.get_value('power-options').deep_unpack();
        for (let i = 0; i < powerOptions.length; i++) {
            const [powerType, shouldShow] = powerOptions[i];
            if (shouldShow) {
                const powerButton = new PowerButton(menuLayout, powerType);
                powerButton.connectObject('key-focus-in',
                    () => Utils.ensureActorVisibleInScrollView(powerButton, this._orientation), this);
                powerButton.style = 'margin: 0px;';
                box.add_child(powerButton);
            }
        }
    }
}

// 'Power Off / Log Out' button with popupmenu that shows lock, power off, restart, etc
export class LeaveButton extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, showLabel) {
        super(menuLayout);
        this.menuButton = menuLayout.menuButton;

        this.toggleMenuOnClick = false;
        this.iconName = 'system-shutdown-symbolic';
        this.showLabel = showLabel;

        this._createLeaveMenu();

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);

        this._updateIcon();

        if (showLabel) {
            this.label = new St.Label({
                text: _('Power Off / Log Out'),
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.label);
        } else {
            this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;
            this.style_class = 'popup-menu-item arcmenu-button';
            this.set({
                x_expand: false,
                x_align: Clutter.ActorAlign.CENTER,
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER,
            });

            this.toggleMenuOnClick = true;
            this._displayType = Constants.DisplayType.BUTTON;
            this.tooltipText = _('Power Off / Log Out');
        }
    }

    createIcon(overrideIconSize) {
        const IconSizeEnum = this.showLabel ? this._settings.get_enum('quicklinks-item-icon-size')
            : this._settings.get_enum('button-item-icon-size');
        const defaultIconSize = this.showLabel ? this._menuLayout.quicklinks_icon_size
            : this._menuLayout.buttons_icon_size;
        const iconSize = Utils.getIconSize(IconSizeEnum, defaultIconSize);

        return new St.Icon({
            gicon: Gio.icon_new_for_string(this.iconName),
            icon_size: overrideIconSize ? overrideIconSize : iconSize,
            x_expand: !this.showLabel,
            x_align: this.showLabel ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER,
        });
    }

    setIconSize(size) {
        if (!this._iconBin)
            return;
        this._iconBin.set_child(this.createIcon(size));
    }

    _createLeaveMenu() {
        this.leaveMenu = new PopupMenu.PopupMenu(this, 0.5, St.Side.BOTTOM);
        this.leaveMenu.blockSourceEvents = true;
        this.leaveMenu.actor.add_style_class_name('popup-menu arcmenu-menu');
        const section = new PopupMenu.PopupMenuSection();
        this.leaveMenu.addMenuItem(section);

        const box = new St.BoxLayout({vertical: true});
        box._delegate = box;
        section.actor.add_child(box);

        const sessionBox = new St.BoxLayout({vertical: true});
        sessionBox.add_child(this._menuLayout.createLabelRow(_('Session')));
        box.add_child(sessionBox);

        const systemBox = new St.BoxLayout({vertical: true});
        systemBox.add_child(this._menuLayout.createLabelRow(_('System')));
        box.add_child(systemBox);

        let hasSessionOption, hasSystemOption;
        const powerOptions = this._settings.get_value('power-options').deep_unpack();
        for (let i = 0; i < powerOptions.length; i++) {
            const [powerType, shouldShow] = powerOptions[i];
            if (shouldShow) {
                const powerButton = new PowerMenuItem(this._menuLayout, powerType);
                if (powerType === Constants.PowerType.LOCK || powerType === Constants.PowerType.LOGOUT ||
                    powerType === Constants.PowerType.SWITCH_USER) {
                    hasSessionOption = true;
                    sessionBox.add_child(powerButton);
                } else {
                    hasSystemOption = true;
                    systemBox.add_child(powerButton);
                }
            }
        }

        if (!hasSessionOption)
            sessionBox.hide();
        if (!hasSystemOption)
            systemBox.hide();

        this._menuLayout.subMenuManager.addMenu(this.leaveMenu);
        this.leaveMenu.actor.hide();
        Main.uiGroup.add_child(this.leaveMenu.actor);
        this.leaveMenu.connect('open-state-changed', (menu, open) => {
            if (open) {
                this.add_style_pseudo_class('active');
                if (this.menuButton.tooltipShowingID) {
                    GLib.source_remove(this.menuButton.tooltipShowingID);
                    this.menuButton.tooltipShowingID = null;
                    this.menuButton.tooltipShowing = false;
                }
                if (this.tooltip) {
                    this.tooltip.hide();
                    this.menuButton.tooltipShowing = false;
                }
            } else {
                this.remove_style_pseudo_class('active');
                this.active = false;
                this.sync_hover();
                this.hovered = this.hover;
            }
        });
    }

    _onDestroy() {
        Main.uiGroup.remove_child(this.leaveMenu.actor);
        this.leaveMenu.destroy();
    }

    activate(event) {
        super.activate(event);
        this.leaveMenu.toggle();
    }
}

export class PowerButton extends ArcMenuButtonItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, powerType) {
        super(menuLayout, Constants.PowerOptions[powerType].NAME,
            Constants.PowerOptions[powerType].ICON);
        this.powerType = powerType;

        bindPowerItemVisibility(this);
    }

    activate() {
        this._menuLayout.arcMenu.toggle();
        activatePowerOption(this.powerType);
    }
}

export class PowerMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, type) {
        super(menuLayout);
        this.powerType = type;

        bindPowerItemVisibility(this);

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);
        this._updateIcon();

        this.label = new St.Label({
            text: _(Constants.PowerOptions[this.powerType].NAME),
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this.add_child(this.label);
    }

    createIcon() {
        const IconSizeEnum = this._settings.get_enum('quicklinks-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, this._menuLayout.quicklinks_icon_size);

        return new St.Icon({
            gicon: Gio.icon_new_for_string(Constants.PowerOptions[this.powerType].ICON),
            style_class: 'popup-menu-icon',
            icon_size: iconSize,
        });
    }

    activate() {
        this._menuLayout.arcMenu.toggle();
        activatePowerOption(this.powerType);
    }
}

export class NavigationButton extends ArcMenuButtonItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, text, arrowSymbolic, activateAction, arrowSide) {
        super(menuLayout, null, arrowSymbolic);
        this.activateAction = activateAction;

        this.set({
            style: 'min-height: 28px; padding: 0px 8px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });

        this.toggleMenuOnClick = false;

        this._label = new St.Label({
            text: _(text),
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_expand: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (arrowSide === St.Side.LEFT)
            this.add_child(this._label);
        else
            this.insert_child_at_index(this._label, 0);
    }

    createIcon() {
        const IconSizeEnum = this._settings.get_enum('misc-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, Constants.EXTRA_SMALL_ICON_SIZE);

        return new St.Icon({
            gicon: this.gicon ? this.gicon : Gio.icon_new_for_string(this.iconName),
            icon_size: iconSize,
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
    }

    activate(event) {
        super.activate(event);
        this.activateAction();
    }
}

export class GoNextButton extends NavigationButton {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, title, activateAction) {
        super(menuLayout, _(title), 'go-next-symbolic', () => activateAction());
    }
}

export class GoPreviousButton extends NavigationButton {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, activateAction) {
        super(menuLayout, _('Back'), 'go-previous-symbolic', () => activateAction(), St.Side.LEFT);
    }
}

// Menu item to go back to category view
export class BackButton extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout) {
        super(menuLayout);

        this._iconBin = new St.Bin({
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
        });
        this.add_child(this._iconBin);
        this._updateIcon();

        const label = new St.Label({
            text: _('Back'),
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);
    }

    createIcon() {
        const IconSizeEnum = this._settings.get_enum('misc-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, Constants.MISC_ICON_SIZE);

        return new St.Icon({
            icon_name: 'go-previous-symbolic',
            icon_size: iconSize,
            style_class: 'popup-menu-icon',
        });
    }

    activate(event) {
        const layout = this._settings.get_enum('menu-layout');
        if (layout === Constants.MenuLayout.ARCMENU) {
            // If the current page is inside a category and
            // previous page was the categories page,
            // go back to categories page
            if (this._menuLayout.previousCategoryType === Constants.CategoryType.CATEGORIES_LIST &&
                (this._menuLayout.activeCategoryType <= 4 ||
                this._menuLayout.activeCategoryType instanceof GMenu.TreeDirectory))
                this._menuLayout.displayCategories();
            else
                this._menuLayout.setDefaultMenuView();
        } else if (layout === Constants.MenuLayout.TOGNEE) {
            this._menuLayout.setDefaultMenuView();
        }
        super.activate(event);
    }
}

// Menu item to view all apps
export class ViewAllAppsButton extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout) {
        super(menuLayout);

        const label = new St.Label({
            text: _('All Apps'),
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);

        this._iconBin = new St.Bin({
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
        });
        this.add_child(this._iconBin);
        this._updateIcon();
    }

    createIcon() {
        const IconSizeEnum = this._settings.get_enum('misc-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, Constants.MISC_ICON_SIZE);

        return new St.Icon({
            icon_name: 'go-next-symbolic',
            icon_size: iconSize,
            x_align: Clutter.ActorAlign.START,
            style_class: 'popup-menu-icon',
        });
    }

    activate(event) {
        const defaultMenuView = this._settings.get_enum('default-menu-view');
        if (defaultMenuView === Constants.DefaultMenuView.PINNED_APPS ||
            defaultMenuView === Constants.DefaultMenuView.FREQUENT_APPS)
            this._menuLayout.displayCategories();
        else
            this._menuLayout.displayAllApps();
        super.activate(event);
    }
}

export class ShortcutMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, menuItemArray, displayType, isContainedInCategory) {
        super(menuLayout);
        this._displayType = displayType;
        this.isContainedInCategory = isContainedInCategory;

        let [name] = menuItemArray;
        const [, icon, command] = menuItemArray;
        this._command = command;
        this.iconName = icon;

        const shortcutIconType = this._settings.get_enum('shortcut-icon-type');
        if (shortcutIconType === Constants.CategoryIconType.FULL_COLOR)
            this.add_style_class_name('regular-icons');
        else
            this.add_style_class_name('symbolic-icons');

        // Check for default commands--------
        if (this._command === Constants.ShortcutCommands.SOFTWARE)
            this._command = Utils.findSoftwareManager();

        if (!this._app)
            this._app = Shell.AppSystem.get_default().lookup_app(this._command);

        if (this._app && icon === '') {
            const appIcon = this._app.create_icon_texture(Constants.MEDIUM_ICON_SIZE);
            if (appIcon instanceof St.Icon)
                this.iconName = appIcon.gicon.to_string();
        }

        if (name === '' && this._app)
            name = this._app.get_name();
        // -------------------------------------

        this.hasContextMenu = !!this._app;

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);
        this._updateIcon();

        this.label = new St.Label({
            text: _(name),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const layout = this._settings.get_enum('menu-layout');
        if (layout === Constants.MenuLayout.PLASMA &&
            this._settings.get_boolean('apps-show-extra-details') && this._app) {
            const labelBox = new St.BoxLayout({
                vertical: true,
            });
            const descriptionLabel = new St.Label({
                text: this._app.get_description(),
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'font-weight: lighter;',
            });
            labelBox.add_child(this.label);
            if (this._app.get_description())
                labelBox.add_child(descriptionLabel);
            this.add_child(labelBox);
        } else {
            this.add_child(this.label);
        }

        if (this._displayType === Constants.DisplayType.GRID)
            Utils.convertToGridLayout(this);
        else if (this._displayType === Constants.DisplayType.BUTTON)
            Utils.convertToButton(this);

        this.setShouldShow();
    }

    createIcon() {
        let iconSizeEnum;
        if (this.isContainedInCategory)
            iconSizeEnum = this._settings.get_enum('menu-item-icon-size');
        else
            iconSizeEnum = this._settings.get_enum('quicklinks-item-icon-size');

        let defaultIconSize, iconSize;
        if (this._displayType === Constants.DisplayType.BUTTON) {
            iconSizeEnum = this._settings.get_enum('button-item-icon-size');
            defaultIconSize = this._menuLayout.buttons_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
            this.style = `min-width: ${iconSize}px; min-height: ${iconSize}px;`;
        } else if (this._displayType === Constants.DisplayType.GRID) {
            iconSizeEnum = this._settings.get_enum('menu-item-grid-icon-size');
            defaultIconSize = this._menuLayout.icon_grid_size;
            ({iconSize} = Utils.getGridIconSize(iconSizeEnum, defaultIconSize));
        } else {
            defaultIconSize = this.isContainedInCategory ? this._menuLayout.apps_icon_size
                : this._menuLayout.quicklinks_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
        }

        return new St.Icon({
            icon_name: this.iconName,
            gicon: Gio.icon_new_for_string(this.iconName),
            style_class: this._displayType === Constants.DisplayType.LIST ? 'popup-menu-icon' : '',
            icon_size: iconSize,
        });
    }

    popupContextMenu() {
        if (this._app && this.contextMenu === undefined) {
            this.contextMenu = new AppContextMenu(this, this._menuLayout);
            if (this._menuLayout.context_menu_location === Constants.ContextMenuLocation.BOTTOM_CENTERED)
                this.contextMenu.centerBoxPointerPosition();
            else if (this._menuLayout.context_menu_location === Constants.ContextMenuLocation.RIGHT)
                this.contextMenu.rightBoxPointerPosition();

            if (this._app)
                this.contextMenu.setApp(this._app);
            else if (this.folderPath)
                this.contextMenu.setFolderPath(this.folderPath);
        }
        if (this.contextMenu !== undefined) {
            if (this.tooltip !== undefined)
                this.tooltip.hide();
            this.contextMenu.open(BoxPointer.PopupAnimation.FULL);
        }
    }

    activate() {
        switch (this._command) {
        case Constants.ShortcutCommands.LOG_OUT:
        case Constants.ShortcutCommands.LOCK:
        case Constants.ShortcutCommands.POWER_OFF:
        case Constants.ShortcutCommands.RESTART:
        case Constants.ShortcutCommands.SUSPEND:
        case Constants.ShortcutCommands.HIBERNATE:
        case Constants.ShortcutCommands.HYBRID_SLEEP:
        case Constants.ShortcutCommands.SWITCH_USER: {
            const powerType = Utils.getPowerTypeFromShortcutCommand(this._command);
            activatePowerOption(powerType);
            break;
        }
        case Constants.ShortcutCommands.OVERVIEW:
            Main.overview.show();
            break;
        case Constants.ShortcutCommands.RUN_COMMAND:
            Main.openRunDialog();
            break;
        case Constants.ShortcutCommands.SHOW_APPS:
            Main.overview._overview._controls._toggleAppsPage();
            break;
        default: {
            if (this._app)
                this._app.open_new_window(-1);
            else
                Util.spawnCommandLine(this._command);
        }
        }
        this._menuLayout.arcMenu.toggle();
    }
}

// Menu item which displays the current user
export class UserMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, displayType) {
        super(menuLayout);
        this._menuLayout = menuLayout;
        this._displayType = displayType;

        if (this._settings.get_enum('avatar-style') === Constants.AvatarStyle.ROUND)
            this.avatarStyle = 'arcmenu-avatar-round';
        else
            this.avatarStyle = 'arcmenu-avatar-square';

        if (this._displayType === Constants.DisplayType.BUTTON) {
            const IconSizeEnum = this._settings.get_enum('button-item-icon-size');
            const defaultIconSize = this._menuLayout.buttons_icon_size;
            this.iconSize = Utils.getIconSize(IconSizeEnum, defaultIconSize);
            this.userMenuIcon.set_style_class_name(`${this.avatarStyle} user-icon`);
        } else {
            const IconSizeEnum = this._settings.get_enum('misc-item-icon-size');
            this.iconSize = Utils.getIconSize(IconSizeEnum, USER_AVATAR_SIZE);
        }

        this.userMenuIcon = new UserMenuIcon(menuLayout, this.iconSize, false);
        this.add_child(this.userMenuIcon);
        this.label = this.userMenuIcon.label;
        this.add_child(this.label);

        if (this._displayType === Constants.DisplayType.BUTTON)
            Utils.convertToButton(this);
    }

    activate(event) {
        Util.spawnCommandLine('gnome-control-center user-accounts');
        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }
}

export class UserMenuIcon extends St.Bin {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, iconSize, hasTooltip) {
        const {settings} = menuLayout;

        let avatarStyle;
        if (settings.get_enum('avatar-style') === Constants.AvatarStyle.ROUND)
            avatarStyle = 'arcmenu-avatar-round';
        else
            avatarStyle = 'arcmenu-avatar-square';

        super({
            style_class: `${avatarStyle} user-icon popup-menu-icon`,
            track_hover: true,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: `width: ${iconSize}px; height: ${iconSize}px;`,
        });

        this._menuButton = menuLayout.menuButton;
        this._menuLayout = menuLayout;
        this.iconSize = iconSize;
        this.tooltipLocation = Constants.TooltipLocation.BOTTOM_CENTERED;

        this._user = AccountsService.UserManager.get_default().get_user(GLib.get_user_name());

        this.label = new St.Label({
            text: GLib.get_real_name(),
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._user.connectObject('notify::is-loaded', this._onUserChanged.bind(this), this);
        this._user.connectObject('changed', this._onUserChanged.bind(this), this);

        if (hasTooltip)
            this.connect('notify::hover', this._onHover.bind(this));

        this._onUserChanged();
    }

    _onHover() {
        if (this.hover) {
            this._menuButton.tooltip.showTooltip(this, this.tooltipLocation, GLib.get_real_name(),
                null, Constants.DisplayType.BUTTON);
        } else {
            this._menuButton.tooltip.hide();
        }
    }

    _onUserChanged() {
        if (this._user.is_loaded) {
            this.label.set_text(this._user.get_real_name());
            if (this.tooltip)
                this.tooltip.titleLabel.text = this._user.get_real_name();

            let iconFile = this._user.get_icon_file();
            if (iconFile && !GLib.file_test(iconFile, GLib.FileTest.EXISTS))
                iconFile = null;

            if (iconFile) {
                this.child = null;
                this.add_style_class_name('user-avatar');
                this.style = `${'background-image: url("%s");'.format(iconFile)}width: ${this.iconSize}px; height: ${this.iconSize}px;`;
            } else {
                this.style = `width: ${this.iconSize}px; height: ${this.iconSize}px;`;
                this.child = new St.Icon({
                    icon_name: 'avatar-default-symbolic',
                    icon_size: this.iconSize,
                    style: `padding: 5px; width: ${this.iconSize}px; height: ${this.iconSize}px;`,
                });
            }
        }
    }
}

export class PinnedAppsMenuItem extends ArcMenuPopupBaseMenuItem {
    static [GObject.signals] = {'pinned-apps-changed': {}};

    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, pinnedAppData, displayType, isContainedInCategory) {
        super(menuLayout);
        this._menuButton = menuLayout.menuButton;
        [this._name, this._icon, this._command] = pinnedAppData;
        this._displayType = displayType;
        this.isContainedInCategory = isContainedInCategory;

        this._app = Shell.AppSystem.get_default().lookup_app(this._command);
        this.hasContextMenu = true;
        this.gridLocation = [-1, -1];
        this._iconString = this._icon;

        if (this._iconString === Constants.ShortcutCommands.ARCMENU_ICON || this._iconString === `${this._extension.path}/icons/arcmenu-logo-symbolic.svg`)
            this._iconString = `${this._extension.path}/${Constants.ArcMenuLogoSymbolic}`;

        if (this._app && this._iconString === '') {
            const appIcon = this._app.create_icon_texture(Constants.MEDIUM_ICON_SIZE);
            if (appIcon instanceof St.Icon) {
                this._iconString = appIcon.gicon ? appIcon.gicon.to_string() : appIcon.fallback_icon_name;
                if (!this._iconString)
                    this._iconString = '';
            }
        }

        if (this._app && !this._name)
            this._name = this._app.get_name();


        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);
        this._updateIcon();

        this.label = new St.Label({
            text: _(this._name),
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const showExtraDetails = this._settings.get_boolean('apps-show-extra-details');
        if (this._displayType === Constants.DisplayType.LIST && showExtraDetails &&
            this._app && this._app.get_description()) {
            const labelBox = new St.BoxLayout({vertical: true});
            const descriptionLabel = new St.Label({
                text: this._app.get_description(),
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'font-weight: lighter;',
            });
            labelBox.add_child(this.label);
            labelBox.add_child(descriptionLabel);
            this.add_child(labelBox);
        } else {
            this.add_child(this.label);
        }

        this.remove_action(this._panAction);
        this.remove_action(this._clickAction);
        this._draggable = DND.makeDraggable(this, {timeoutThreshold: 400});
        this._draggable.addClickAction(this._clickAction);
        this._draggable._animateDragEnd = eventTime => {
            this._draggable._animationInProgress = true;
            this._draggable._onAnimationComplete(this._draggable._dragActor, eventTime);
        };
        this.isDraggableApp = true;
        this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this._draggable.connect('drag-end', this._onDragEnd.bind(this));

        if (this._displayType === Constants.DisplayType.GRID)
            Utils.convertToGridLayout(this);

        this.setShouldShow();
    }

    createIcon() {
        let iconSize;
        if (this._displayType === Constants.DisplayType.GRID) {
            const iconSizeEnum = this._settings.get_enum('menu-item-grid-icon-size');
            const defaultIconSize = this._menuLayout.icon_grid_size;
            ({iconSize} = Utils.getGridIconSize(iconSizeEnum, defaultIconSize));
        } else if (this._displayType === Constants.DisplayType.LIST) {
            const iconSizeEnum = this._settings.get_enum('menu-item-icon-size');
            const defaultIconSize = this.isContainedInCategory ? this._menuLayout.apps_icon_size
                : this._menuLayout.pinned_apps_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
        }

        return new St.Icon({
            gicon: Gio.icon_new_for_string(this._iconString),
            icon_size: iconSize,
            style_class: this._displayType === Constants.DisplayType.GRID ? '' : 'popup-menu-icon',
        });
    }

    popupContextMenu() {
        if (this.contextMenu === undefined) {
            this.contextMenu = new AppContextMenu(this, this._menuLayout);
            if (this._displayType === Constants.DisplayType.GRID)
                this.contextMenu.centerBoxPointerPosition();
            if (this._app)
                this.contextMenu.setApp(this._app);
            else
                this.contextMenu.addUnpinItem(this._command);
        }
        if (this.tooltip !== undefined)
            this.tooltip.hide();
        this.contextMenu.open(BoxPointer.PopupAnimation.FULL);
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

    _onDragMotion(dragEvent) {
        const parent = this.get_parent();
        const layoutManager = parent.layout_manager;
        if (!(layoutManager instanceof Clutter.GridLayout))
            return DND.DragMotionResult.CONTINUE;

        const targetActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, dragEvent.x, dragEvent.y);
        if (!(targetActor instanceof PinnedAppsMenuItem) || targetActor === this)
            return DND.DragMotionResult.CONTINUE;

        Utils.reorderMenuItems(this, targetActor.gridLocation);
        Utils.ensureActorVisibleInScrollView(this);
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
            this._menuLayout.pinnedAppsArray = Utils.getOrderedGridChildren(parent);
            this.emit('pinned-apps-changed');
        }
    }

    getDragActor() {
        const icon = new St.Icon({
            gicon: Gio.icon_new_for_string(this._iconString),
            style_class: 'popup-menu-icon',
            icon_size: this._iconBin.get_child().icon_size,
        });
        return icon;
    }

    getDragActorSource() {
        return this;
    }

    activate(event) {
        if (this._app)
            this._app.open_new_window(-1);
        else if (this._command === Constants.ShortcutCommands.SHOW_APPS)
            Main.overview._overview._controls._toggleAppsPage();
        else
            Util.spawnCommandLine(this._command);

        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }
}

export class ApplicationMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, app, displayType, metaInfo, isContainedInCategory) {
        super(menuLayout);
        this._app = app;
        this._displayType = displayType;
        this.metaInfo = metaInfo || {};
        this.isContainedInCategory = isContainedInCategory;

        this.searchType = this._menuLayout.search_display_type;
        this.hasContextMenu = !!this._app;
        this.isSearchResult = !!Object.keys(this.metaInfo).length;

        if (this._app) {
            const disableRecentAppsIndicator = this._settings.get_boolean('disable-recently-installed-apps');
            if (!disableRecentAppsIndicator) {
                const recentApps = this._settings.get_strv('recently-installed-apps');
                this.isRecentlyInstalled = recentApps.some(appIter => appIter === this._app.get_id());
            }
        }

        this._iconBin = new St.Bin({
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._iconBin);

        this._updateIcon();

        this.label = new St.Label({
            text: this._app ? this._app.get_name() : this.metaInfo['name'],
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.description = this._app ? this._app.get_description() : this.metaInfo['description'];

        const showSearchDescriptions = this._settings.get_boolean('show-search-result-details') &&
                                       this.isSearchResult;
        const showAppDescriptions = this._settings.get_boolean('apps-show-extra-details') &&
                                    !this.isSearchResult;
        const isCalculatorProvider = this.metaInfo['provider-id'] === 'org.gnome.Calculator.desktop';

        if (this._displayType === Constants.DisplayType.LIST && this.description &&
            (showSearchDescriptions || showAppDescriptions || isCalculatorProvider)) {
            const labelBox = new St.BoxLayout({
                vertical: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
            });
            const [descriptionText] = this.description.split('\n');
            this.descriptionLabel = new St.Label({
                text: descriptionText,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'font-weight: lighter;',
            });
            labelBox.add_child(this.label);
            labelBox.add_child(this.descriptionLabel);
            this.add_child(labelBox);
        } else {
            this.add_child(this.label);
        }

        this.label_actor = this.label;

        if (this.isRecentlyInstalled) {
            this._indicator = new St.Label({
                text: _('New'),
                style_class: 'arcmenu-text-indicator',
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this._indicator);
        }
        if (this._displayType === Constants.DisplayType.GRID)
            Utils.convertToGridLayout(this);

        this.connect('notify::hover', () => this.removeIndicator());
        this.connect('key-focus-in', () => this.removeIndicator());

        const isDraggable = this._menuLayout.draggableApps;
        if (isDraggable && this._app) {
            this.pivot_point = new Graphene.Point({x: 0.5, y: 0.5});
            this.remove_action(this._clickAction);
            this.remove_action(this._panAction);
            this._draggable = DND.makeDraggable(this, {timeoutThreshold: 400});
            this._draggable.addClickAction(this._clickAction);
            this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
            this._draggable.connect('drag-end', this._onDragEnd.bind(this));
        }
    }

    setFolderGroup(folderMenuItem) {
        this.folderMenuItem = folderMenuItem;
    }

    getDragActor() {
        const icon = this.createIcon();
        icon.set({
            scale_x: 0.8,
            scale_y: 0.8,
        });
        return icon;
    }

    getDragActorSource() {
        return this;
    }

    _onDragBegin() {
        this._menuLayout.fadeInPlaceHolder();
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

        this.scaleAndFade();
    }

    _onDragMotion(dragEvent) {
        if (!this.folderMenuItem || this.folderMenuItem.home_folder)
            return DND.DragMotionResult.CONTINUE;

        const parent = this.get_parent();
        const layoutManager = parent.layout_manager;
        if (!(layoutManager instanceof Clutter.GridLayout))
            return DND.DragMotionResult.CONTINUE;

        const targetActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, dragEvent.x, dragEvent.y);
        if (!(targetActor instanceof ApplicationMenuItem) || targetActor === this)
            return DND.DragMotionResult.CONTINUE;

        Utils.reorderMenuItems(this, targetActor.gridLocation);
        Utils.ensureActorVisibleInScrollView(this);
        return DND.DragMotionResult.CONTINUE;
    }

    acceptDrop(source) {
        if (!source === this || !this.folderMenuItem)
            return false;

        const parent = this.get_parent();
        const layoutManager = parent.layout_manager;
        const inHomeFolder = this.folderMenuItem.home_folder;
        if (layoutManager instanceof Clutter.GridLayout && !inHomeFolder) {
            let x = 0, y = 0;
            const columns = layoutManager.gridColumns;
            const orderedList = [];
            const children = parent.get_children();
            for (let i = 0; i < children.length; i++) {
                const child = layoutManager.get_child_at(x, y);
                const appId = child._app.id;
                orderedList.push(appId);
                [x, y] = Utils.getNextGridPosition(x, y, columns);
            }
            this._menuLayout.reorderFolderApps(this.folderMenuItem, orderedList);
        }
        return true;
    }

    _onDragEnd() {
        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }
        this._menuLayout.fadeOutPlaceHolder();
        this._dragging = false;
        this.undoScaleAndFade();

        if (this._menuLayout.activeCategoryItem === this.folderMenuItem)
            this.folderMenuItem.displayAppList();
    }

    scaleAndFade() {
        this.set({
            opacity: 100,
        });
    }

    undoScaleAndFade() {
        this.set({
            opacity: 255,
        });
    }

    set folderPath(value) {
        this.hasContextMenu = value;
        this._folderPath = value;
    }

    get folderPath() {
        return this._folderPath;
    }

    createIcon() {
        let iconSize;
        if (this._displayType === Constants.DisplayType.GRID) {
            this._iconBin.x_align = Clutter.ActorAlign.CENTER;

            const iconSizeEnum = this._settings.get_enum('menu-item-grid-icon-size');
            const defaultIconSize = this._menuLayout.icon_grid_size;
            ({iconSize} = Utils.getGridIconSize(iconSizeEnum, defaultIconSize));
        } else if (this._displayType === Constants.DisplayType.LIST) {
            const iconSizeEnum = this._settings.get_enum('menu-item-icon-size');
            const defaultIconSize = this.isContainedInCategory ||
                this.isSearchResult ? this._menuLayout.apps_icon_size
                : this._menuLayout.pinned_apps_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
        }

        const icon = this.isSearchResult ? this.metaInfo['createIcon'](iconSize)
            : this._app.create_icon_texture(iconSize);

        if (icon) {
            icon.style_class = this._displayType === Constants.DisplayType.GRID ? '' : 'popup-menu-icon';
            return icon;
        } else {
            return false;
        }
    }

    removeIndicator() {
        if (this.isRecentlyInstalled) {
            this.isRecentlyInstalled = false;
            const recentApps = this._settings.get_strv('recently-installed-apps');
            const index = recentApps.indexOf(this._app.get_id());
            if (index > -1)
                recentApps.splice(index, 1);

            this._settings.set_strv('recently-installed-apps', recentApps);

            this._indicator.hide();
            this._menuLayout.setNewAppIndicator();
        }
    }

    popupContextMenu() {
        this.removeIndicator();
        if (this.tooltip)
            this.tooltip.hide();

        if (!this._app && !this.folderPath)
            return;

        if (this.contextMenu === undefined) {
            this.contextMenu = new AppContextMenu(this, this._menuLayout);
            if (this._app)
                this.contextMenu.setApp(this._app);
            else if (this.folderPath)
                this.contextMenu.setFolderPath(this.folderPath);
            if (this._displayType === Constants.DisplayType.GRID)
                this.contextMenu.centerBoxPointerPosition();
        }

        this.contextMenu.open(BoxPointer.PopupAnimation.FULL);
    }

    activateSearchResult(provider, metaInfo, terms) {
        this._menuLayout.arcMenu.toggle();
        if (provider.activateResult) {
            provider.activateResult(metaInfo.id, terms);
            if (metaInfo.clipboardText)
                St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, metaInfo.clipboardText);
        } else if (metaInfo.id.endsWith('.desktop')) {
            const app = Shell.AppSystem.get_default().lookup_app(metaInfo.id);
            if (app.can_open_new_window())
                app.open_new_window(-1);
            else
                app.activate();
        } else {
            this._menuLayout.arcMenu.itemActivated(BoxPointer.PopupAnimation.NONE);
            const systemActions = SystemActions.getDefault();

            // SystemActions.activateAction('open-screenshot-ui') waits for
            // Main.overview to be hidden before launching ScreenshotUI.
            // Avoid that by directly calling Screenshot.showScreenshotUI().
            if (metaInfo.id === 'open-screenshot-ui') {
                showScreenshotUI();
                return;
            }

            systemActions.activateAction(metaInfo.id);
        }
    }

    activate(event) {
        this.removeIndicator();

        if (this.isSearchResult) {
            this.activateSearchResult(this.provider, this.metaInfo, this.resultsView.terms, event);
        } else {
            this._app.open_new_window(-1);
            this._menuLayout.arcMenu.toggle();
            super.activate(event);
        }
    }
}

export class SubCategoryMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, parentDirectory, category, displayType) {
        super(menuLayout);

        this._category = category;
        this._parentDirectory = parentDirectory;
        this._displayType = displayType;

        this.appList = [];
        this._name = '';

        const categoryIconType = this._settings.get_enum('category-icon-type');
        if (categoryIconType === Constants.CategoryIconType.FULL_COLOR)
            this.add_style_class_name('regular-icons');
        else
            this.add_style_class_name('symbolic-icons');

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);

        this.label = new St.Label({
            text: this._name,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);

        if (this._displayType === Constants.DisplayType.GRID)
            Utils.convertToGridLayout(this);

        this.label_actor = this.label;

        this.description = parentDirectory.get_name();

        this.dummyCursor = new St.Widget({width: 0, height: 0, opacity: 0});
        Main.uiGroup.add_child(this.dummyCursor);

        this._subMenuPopup = new PopupMenu.PopupMenu(this.dummyCursor, 0.5, St.Side.TOP);
        this._subMenuPopup.actor.add_style_class_name('popup-menu arcmenu-menu');
        this._subMenuPopup.connect('open-state-changed', this._subMenuOpenStateChanged.bind(this));
        this.connect('destroy', () => {
            Main.uiGroup.remove_child(this.dummyCursor);
            Main.uiGroup.remove_child(this._subMenuPopup.actor);
            this._subMenuPopup.destroy();
            this.dummyCursor.destroy();
        });

        this._menuLayout.subMenuManager.addMenu(this._subMenuPopup);
        this._subMenuPopup.actor.hide();
        Main.uiGroup.add_child(this._subMenuPopup.actor);

        this.disconnectObject(this._subMenuPopup);
        this.connectObject('notify::mapped', () => {
            if (!this.mapped)
                this._subMenuPopup.close();
        }, this._subMenuPopup);

        this._headerLabel = new St.Label({
            style: 'font-weight: bold; padding-top: 10px; padding-bottom: 10px; text-align: center;',
            text: this._name,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._subMenuPopup.box.add_child(this._headerLabel);

        const layout = new Clutter.GridLayout({
            orientation: Clutter.Orientation.VERTICAL,
            column_spacing: 12,
            row_spacing: 12,
        });
        layout.forceGridColumns = 3;

        const scrollView = this._menuLayout._createScrollBox({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.START,
            style_class: this._menuLayout._disableFadeEffect ? '' : 'vfade',
            style: 'width: 350px; height: 310px;',
        });
        const box = new St.BoxLayout({
            style: 'padding: 6px;',
        });
        scrollView.add_actor(box);

        this._subMenuGrid = new St.Widget({
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            layout_manager: layout,
        });
        box.add_child(this._subMenuGrid);

        layout.hookup_style(this._subMenuGrid);
        this._subMenuPopup.box.add_child(scrollView);
        this._subMenuPopup.box.set({
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
    }

    _subMenuOpenStateChanged(menu, isOpen) {
        const [sourceX, sourceY] =
        this._arcMenu.actor.get_transformed_position();

        const positionX = sourceX + (this._arcMenu.actor.width / 2);
        const positionY = sourceY + (this._arcMenu.actor.height / 2) - ((this._subMenuPopup.actor.height / 2));

        this.dummyCursor.set_position(Math.round(positionX), Math.round(positionY));

        this._setDimmed(isOpen);
        if (isOpen) {
            this._subMenuPopup.box.set({
                scale_x: .3,
                scale_y: .3,
                opacity: 0,
            });
            this._subMenuPopup.box.ease({
                scale_x: 1,
                scale_y: 1,
                opacity: 255,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });

            this.add_style_pseudo_class('active');
            if (this._menuButton.tooltipShowingID) {
                GLib.source_remove(this._menuButton.tooltipShowingID);
                this._menuButton.tooltipShowingID = null;
                this._menuButton.tooltipShowing = false;
            }
            if (this.tooltip) {
                this.tooltip.hide();
                this._menuButton.tooltipShowing = false;
            }
        } else {
            this._subMenuPopup.box.ease({
                scale_x: .3,
                scale_y: .3,
                opacity: 0,
                duration: 150,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            this.remove_style_pseudo_class('active');
            this.active = false;
            this.sync_hover();
            this.hovered = this.hover;
        }
    }

    _setDimmed(dim) {
        const DIM_BRIGHTNESS = -0.4;
        const POPUP_ANIMATION_TIME = 400;

        const val = 127 * (1 + (dim ? 1 : 0) * DIM_BRIGHTNESS);
        const color = Clutter.Color.new(val, val, val, 255);

        this._arcMenu._boxPointer.ease_property('@effects.dim.brightness', color, {
            mode: Clutter.AnimationMode.LINEAR,
            duration: POPUP_ANIMATION_TIME,
            onStopped: () => (this._arcMenu._dimEffect.enabled = dim),
        });
        this._arcMenu._dimEffect.enabled = true;
    }

    createIcon() {
        let iconSize;
        if (this._displayType === Constants.DisplayType.GRID) {
            this._iconBin.x_align = Clutter.ActorAlign.CENTER;

            const iconSizeEnum = this._settings.get_enum('menu-item-grid-icon-size');
            const defaultIconSize = this._menuLayout.icon_grid_size;
            ({iconSize} = Utils.getGridIconSize(iconSizeEnum, defaultIconSize));
        } else {
            const iconSizeEnum = this._settings.get_enum('menu-item-icon-size');
            const defaultIconSize = this._menuLayout.apps_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
        }

        const [name, gicon, fallbackIcon] = Utils.getCategoryDetails(this._category);
        this._name = `${this._parentDirectory.get_name()} - ${name}`;
        this.label.text = `${name}`;
        this._headerLabel.text = `${this._parentDirectory.get_name()}\n${name}`;

        if (!gicon) {
            if (!this.appList.length) {
                const icon = new St.Icon({
                    style_class: 'popup-menu-icon',
                    icon_size: iconSize,
                    icon_name: 'folder-directory-symbolic',
                });
                return icon;
            }

            const layout = new Clutter.GridLayout({
                row_homogeneous: true,
                column_homogeneous: true,
            });
            const icon = new St.Widget({
                layout_manager: layout,
                style: `width: ${iconSize}px; height: ${iconSize}px;`,
            });

            const subSize = Math.floor(.4 * iconSize);

            const numItems = this.appList.length;
            const rtl = icon.get_text_direction() === Clutter.TextDirection.RTL;
            for (let i = 0; i < 4; i++) {
                const style = `width: ${subSize}px; height: ${subSize}px;`;
                const bin = new St.Bin({style});
                if (i < numItems)
                    bin.child = this.appList[i]._app.create_icon_texture(subSize);
                layout.attach(bin, rtl ? (i + 1) % 2 : i % 2, Math.floor(i / 2), 1, 1);
            }

            return icon;
        }

        const icon = new St.Icon({
            style_class: this._displayType === Constants.DisplayType.GRID ? '' : 'popup-menu-icon',
            icon_size: iconSize,
            gicon,
            fallback_gicon: fallbackIcon,
        });
        return icon;
    }

    isExtraCategory() {
        for (const entry of Constants.Categories) {
            if (entry.CATEGORY === this._category)
                return true;
        }
        return false;
    }

    setNewAppIndicator() {

    }

    populateMenu() {
        const maxColumns = 3;
        this._subMenuGrid.remove_all_children();
        let count = 0;
        let top = -1;
        let left = 0;

        const rtl = this.get_text_direction() === Clutter.TextDirection.RTL;

        for (let i = 0; i < this.appList.length; i++) {
            const item = this.appList[i];

            const parent = item.get_parent();
            if (parent)
                parent.remove_child(item);

            if (!rtl && (count % maxColumns === 0)) {
                top++;
                left = 0;
            } else if (rtl && (left === 0)) {
                top++;
                left = maxColumns;
            }

            this._subMenuGrid.layout_manager.attach(item, left, top, 1, 1);

            if (!rtl)
                left++;
            else if (rtl)
                left--;
            count++;
        }
    }

    activate(event) {
        super.activate(event);
        this._subMenuPopup.toggle();
    }
}

export class CategoryMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, category, displayType) {
        super(menuLayout);
        this._category = category;
        this._displayType = displayType;

        this.appList = [];
        this._name = '';

        const categoryIconType = this._settings.get_enum('category-icon-type');
        if (categoryIconType === Constants.CategoryIconType.FULL_COLOR)
            this.add_style_class_name('regular-icons');
        else
            this.add_style_class_name('symbolic-icons');

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);

        this.label = new St.Label({
            text: this._name,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);

        this._updateIcon();

        this._indicator = new St.Icon({
            icon_name: 'message-indicator-symbolic',
            style_class: 'arcmenu-indicator',
            icon_size: INDICATOR_ICON_SIZE,
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (this.isRecentlyInstalled)
            this.setNewAppIndicator(true);

        if (this._displayType === Constants.DisplayType.BUTTON)
            Utils.convertToButton(this);

        this.label_actor = this.label;
        this.connect('motion-event', this._onMotionEvent.bind(this));
        this.connect('enter-event', this._onEnterEvent.bind(this));
        this.connect('leave-event', this._onLeaveEvent.bind(this));
    }

    createIcon() {
        let iconSize;
        if (this._displayType === Constants.DisplayType.BUTTON) {
            const iconSizeEnum = this._settings.get_enum('button-item-icon-size');
            const defaultIconSize = this._menuLayout.buttons_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);
            this.style = `min-width: ${iconSize}px; min-height: ${iconSize}px;`;
        } else {
            const iconSizeEnum = this._settings.get_enum('menu-item-category-icon-size');
            const defaultIconSize = this._menuLayout.category_icon_size;
            iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);

            if (iconSize === Constants.ICON_HIDDEN) {
                this._iconBin.hide();
                this.style = 'padding-top: 8px; padding-bottom: 8px;';
            }
        }

        const [name, gicon, fallbackIcon] = Utils.getCategoryDetails(this._category);
        this._name = _(name);
        this.label.text = _(name);

        const icon = new St.Icon({
            style_class: this._displayType === Constants.DisplayType.BUTTON ? '' : 'popup-menu-icon',
            icon_size: iconSize,
            gicon,
            fallback_gicon: fallbackIcon,
        });
        return icon;
    }

    isExtraCategory() {
        for (const entry of Constants.Categories) {
            if (entry.CATEGORY === this._category)
                return true;
        }
        return false;
    }

    setNewAppIndicator(shouldShow) {
        if (this._displayType === Constants.DisplayType.BUTTON)
            return;

        this.isRecentlyInstalled = shouldShow;
        if (shouldShow && !this.contains(this._indicator))
            this.add_child(this._indicator);
        else if (!shouldShow && this.contains(this._indicator))
            this.remove_child(this._indicator);
    }

    displayAppList() {
        this._menuLayout.searchEntry?.clearWithoutSearchChangeEvent();
        this._menuLayout.activeCategoryName = this._name;

        switch (this._category) {
        case Constants.CategoryType.HOME_SCREEN:
            this._menuLayout.activeCategoryName = _('Pinned');
            this._menuLayout.displayPinnedApps();
            break;
        case Constants.CategoryType.PINNED_APPS:
            this._menuLayout.displayPinnedApps();
            break;
        case Constants.CategoryType.RECENT_FILES:
            this._menuLayout.displayRecentFiles();
            break;
        default:
            if (this._category === Constants.CategoryType.FREQUENT_APPS)
                this._menuLayout.populateFrequentAppsList(this);
            this._menuLayout.displayCategoryAppList(this.appList, this._category);
            break;
        }

        this._menuLayout.activeCategoryType = this._category;
    }

    activate(event) {
        super.activate(event);
        if (this._menuLayout.supports_category_hover_activation)
            this._menuLayout.setActiveCategory(this);

        this.displayAppList();
    }

    _clearLeaveEventTimeout() {
        if (this._menuLayout.leaveEventTimeoutId) {
            GLib.source_remove(this._menuLayout.leaveEventTimeoutId);
            this._menuLayout.leaveEventTimeoutId = null;
        }
    }

    _shouldActivateOnHover() {
        const activateOnHover = this._settings.get_boolean('activate-on-hover');
        const supportsActivateOnHover = this._menuLayout.supports_category_hover_activation;

        return activateOnHover && supportsActivateOnHover;
    }

    _onEnterEvent() {
        if (!this._shouldActivateOnHover())
            return;

        this._clearLeaveEventTimeout();
    }

    _onLeaveEvent() {
        if (!this._shouldActivateOnHover())
            return;

        if (!this._menuLayout.leaveEventTimeoutId) {
            this._menuLayout.leaveEventTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                this._menuLayout.initialMotionEventItem = null;

                if (this._menuLayout.activeCategoryType === Constants.CategoryType.SEARCH_RESULTS)
                    this._menuLayout.activeCategoryType = -1;

                this._menuLayout.leaveEventTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _onMotionEvent(actor, event) {
        if (!this._shouldActivateOnHover())
            return;

        if (!this._menuLayout.initialMotionEventItem)
            this._menuLayout.initialMotionEventItem = this;

        const inActivationZone = this._inActivationZone(event.get_coords());
        if (inActivationZone) {
            this.activate(Clutter.get_current_event());
            this._menuLayout.initialMotionEventItem = this;
        }
    }

    _inActivationZone([x, y]) {
        // no need to activate the category if its already active
        if (this._menuLayout.activeCategoryType === this._category) {
            this._menuLayout._oldX = x;
            this._menuLayout._oldY = y;
            return false;
        }

        if (!this._menuLayout.initialMotionEventItem)
            return false;

        const [posX, posY] = this._menuLayout.initialMotionEventItem.get_transformed_position();

        // the mouse is on the initialMotionEventItem
        const onInitialMotionEventItem = this._menuLayout.initialMotionEventItem === this;
        if (onInitialMotionEventItem) {
            this._menuLayout._oldX = x;
            this._menuLayout._oldY = y;
            if (this._menuLayout.activeCategoryType !== Constants.CategoryType.SEARCH_RESULTS)
                return true;
        }

        const {width} = this._menuLayout.initialMotionEventItem;
        const {height} = this._menuLayout.initialMotionEventItem;

        const horizontalFlip = this._settings.get_boolean('enable-horizontal-flip');
        const maxX = horizontalFlip ? posX : posX + width;
        const maxY = posY + height;

        const distance = Math.abs(maxX - this._menuLayout._oldX);
        const point1 = [this._menuLayout._oldX, this._menuLayout._oldY];
        const point2 = [maxX, posY - distance];
        const point3 = [maxX, maxY + distance];

        const area = Utils.areaOfTriangle(point1, point2, point3);
        const a1 = Utils.areaOfTriangle([x, y], point2, point3);
        const a2 = Utils.areaOfTriangle(point1, [x, y], point3);
        const a3 = Utils.areaOfTriangle(point1, point2, [x, y]);
        const outsideTriangle = area !== a1 + a2 + a3;

        return outsideTriangle;
    }

    _onDestroy() {
        this._clearLeaveEventTimeout();
        super._onDestroy();
    }
}

// Directory shorctuts. Home, Documents, Downloads, etc
export class PlaceMenuItem extends ArcMenuPopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout, info, displayType, isContainedInCategory) {
        super(menuLayout);
        this._displayType = displayType;
        this._info = info;
        this.isContainedInCategory = isContainedInCategory;

        this.hasContextMenu = false;

        this._iconBin = new St.Bin();
        this.add_child(this._iconBin);
        this._updateIcon();

        this.label = new St.Label({
            text: _(info.name),
            x_expand: true,
            y_expand: false,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this.label);

        if (this._displayType === Constants.DisplayType.BUTTON)
            Utils.convertToButton(this);


        if (info.isRemovable()) {
            this.hasContextMenu = true;

            this._additionalAction = info.eject.bind(info);

            if (info.canUnmount())
                this._additionalActionName = _('Unmount Drive');
            else
                this._additionalActionName = _('Eject Drive');
        }

        if (info.isRemovable()) {
            this._ejectIcon = new St.Icon({
                icon_name: 'media-eject-symbolic',
                style_class: 'popup-menu-icon',
            });
            this._ejectButton = new St.Button({
                child: this._ejectIcon,
                style_class: 'button arcmenu-small-button',
            });
            this._ejectButton.connect('clicked', info.eject.bind(info));
            this.add_child(this._ejectButton);
        }

        this._infoChangedId = this._info.connect('changed', this._propertiesChanged.bind(this), this);
    }

    set folderPath(value) {
        this.hasContextMenu = value;
        this._folderPath = value;
    }

    get folderPath() {
        return this._folderPath;
    }

    forceTitle(title) {
        this._foreTitle = true;
        if (this.label)
            this.label.text = _(title);
    }

    setAsRecentFile(recentFile, removeRecentFile) {
        const parentPath = recentFile.get_parent()?.get_path();
        this.folderPath = parentPath;
        this.description = parentPath;
        this.fileUri = recentFile.get_uri();

        this._additionalAction = () => {
            removeRecentFile();
            this.destroy();
        };
        this._additionalActionName = _('Remove from Recent');
    }

    _onDestroy() {
        if (this._infoChangedId) {
            this._info.disconnect(this._infoChangedId);
            this._infoChangedId = null;
        }

        if (this._info)
            this._info.destroy();
        super._onDestroy();
    }

    popupContextMenu() {
        if (this.tooltip)
            this.tooltip.hide();

        if (this.contextMenu === undefined) {
            this.contextMenu = new AppContextMenu(this, this._menuLayout);
            if (this.folderPath)
                this.contextMenu.setFolderPath(this.folderPath);
            if (this._additionalAction)
                this.contextMenu.addAdditionalAction(_(this._additionalActionName), this._additionalAction);
            if (this._displayType === Constants.DisplayType.GRID)
                this.contextMenu.centerBoxPointerPosition();
        }
        this.contextMenu.toggle();
    }

    createIcon() {
        let iconSizeEnum;
        if (this.isContainedInCategory)
            iconSizeEnum = this._settings.get_enum('menu-item-icon-size');
        else
            iconSizeEnum = this._settings.get_enum('quicklinks-item-icon-size');

        const defaultIconSize = this.isContainedInCategory ? this._menuLayout.apps_icon_size
            : this._menuLayout.quicklinks_icon_size;
        let iconSize = Utils.getIconSize(iconSizeEnum, defaultIconSize);

        if (this._displayType === Constants.DisplayType.BUTTON) {
            const defaultButtonIconSize = this._menuLayout.buttons_icon_size;
            const IconSizeEnum = this._settings.get_enum('button-item-icon-size');
            iconSize = Utils.getIconSize(IconSizeEnum, defaultButtonIconSize);
            this.style = `min-width: ${iconSize}px; min-height: ${iconSize}px;`;
        }

        return new St.Icon({
            gicon: this._info.icon,
            icon_size: iconSize,
            style_class: this._displayType === Constants.DisplayType.BUTTON ? '' : 'popup-menu-icon',
        });
    }

    activate(event) {
        this._info.launch(event.get_time());
        this._menuLayout.arcMenu.toggle();
        super.activate(event);
    }

    _propertiesChanged(info) {
        this._info = info;
        this._iconBin.set_child(this.createIcon());
        if (this.label && !this._foreTitle)
            this.label.text = _(info.name);
    }
}

export class SearchEntry extends St.Entry {
    static [GObject.signals] = {
        'search-changed': {param_types: [GObject.TYPE_STRING]},
        'entry-key-focus-in': { },
        'entry-key-press': {param_types: [Clutter.Event.$gtype]},
    };

    static {
        GObject.registerClass(this);
    }

    constructor(menuLayout) {
        super({
            hint_text: _('Search…'),
            track_hover: true,
            can_focus: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.START,
            name: 'ArcMenuSearchEntry',
            style_class: 'arcmenu-search-entry',
        });

        this._settings = menuLayout.settings;
        this.searchResults = menuLayout.searchResults;

        this._menuLayout = menuLayout;
        this.triggerSearchChangeEvent = true;
        this._iconClickedId = 0;
        const IconSizeEnum = this._settings.get_enum('misc-item-icon-size');
        const iconSize = Utils.getIconSize(IconSizeEnum, Constants.EXTRA_SMALL_ICON_SIZE);

        this._findIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-find-symbolic',
            icon_size: iconSize,
        });

        this._clearIcon = new St.Icon({
            style_class: 'search-entry-icon',
            icon_name: 'edit-clear-symbolic',
            icon_size: iconSize,
        });

        this.set_primary_icon(this._findIcon);

        this._text = this.get_clutter_text();
        this._text.connectObject('text-changed', this._onTextChanged.bind(this), this);
        this._text.connectObject('key-press-event', this._onKeyPress.bind(this), this);
        this._text.connectObject('key-focus-in', this._onKeyFocusIn.bind(this), this);
        this._text.connectObject('key-focus-out', this._onKeyFocusOut.bind(this), this);
        this.connect('destroy', this._onDestroy.bind(this));
    }

    getText() {
        return this.get_text();
    }

    setText(text) {
        this.set_text(text);
    }

    clearWithoutSearchChangeEvent() {
        this.triggerSearchChangeEvent = false;
        this.set_text('');
        this.triggerSearchChangeEvent = true;
    }

    hasKeyFocus() {
        return this.contains(global.stage.get_key_focus());
    }

    clear() {
        this.set_text('');
    }

    isEmpty() {
        return this.get_text().length === 0;
    }

    _onKeyFocusOut() {
        if (!this.isEmpty()) {
            this.add_style_pseudo_class('focus');
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onTextChanged() {
        if (!this.isEmpty()) {
            this.set_secondary_icon(this._clearIcon);
            if (this._iconClickedId === 0) {
                this._iconClickedId = this.connect('secondary-icon-clicked',
                    () => this._menuLayout.setDefaultMenuView());
            }
            if (!this.hasKeyFocus())
                this.grab_key_focus();
            if (!this.searchResults.getTopResult()?.has_style_pseudo_class('active'))
                this.searchResults.getTopResult()?.add_style_pseudo_class('active');
            this.add_style_pseudo_class('focus');
        } else {
            if (this._iconClickedId > 0) {
                this.disconnect(this._iconClickedId);
                this._iconClickedId = 0;
            }
            if (!this.hasKeyFocus())
                this.remove_style_pseudo_class('focus');
            this.set_secondary_icon(null);
        }

        if (this.triggerSearchChangeEvent)
            this.emit('search-changed', this.get_text());
    }

    _onKeyPress(actor, event) {
        const symbol = event.get_key_symbol();
        const searchResult = this.searchResults.getTopResult();

        if (!this.isEmpty() && searchResult) {
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                searchResult.activate(event);
                return Clutter.EVENT_STOP;
            } else if (symbol === Clutter.KEY_Menu && searchResult.hasContextMenu) {
                searchResult.popupContextMenu();
                return Clutter.EVENT_STOP;
            }
        }
        this.emit('entry-key-press', event);
        return Clutter.EVENT_PROPAGATE;
    }

    _onKeyFocusIn() {
        this.add_style_pseudo_class('focus');
        this.emit('entry-key-focus-in');
        return Clutter.EVENT_PROPAGATE;
    }

    _onDestroy() {
        if (this._iconClickedId) {
            this.disconnect(this._iconClickedId);
            this._iconClickedId = null;
        }
    }
}

export const WorldClocksWidget = GObject.registerClass(
class ArcMenuWorldClocksWidget extends GWorldClocksWidget {
    _init(menuLayout) {
        super._init();
        this._menuLayout = menuLayout;
        this.connect('destroy', () => this._onDestroy());

        this._syncID = GObject.signal_handler_find(this._appSystem, {signalId: 'installed-changed'});
        this._clockChangedID = GObject.signal_handler_find(this._settings, {signalId: 'changed'});
    }

    _onDestroy() {
        if (this._syncID) {
            this._appSystem.disconnect(this._syncID);
            this._syncID = null;
        }
        if (this._clockChangedID) {
            this._settings.disconnect(this._clockChangedID);
            this._clockChangedID = null;
        }
        if (this._clocksProxyID) {
            this._clocksProxy.disconnect(this._clocksProxyID);
            this._clocksProxyID = null;
        }
        if (this._clockNotifyId) {
            this._clock.disconnect(this._clockNotifyId);
            this._clockNotifyId = null;
        }
        if (this._tzNotifyId) {
            this._clock.disconnect(this._tzNotifyId);
            this._tzNotifyId = null;
        }
    }

    vfunc_clicked() {
        this._menuLayout.arcMenu.toggle();
        if (this._clocksApp)
            this._clocksApp.activate();
    }

    _onProxyReady(proxy, error) {
        if (error) {
            log(`Failed to create GNOME Clocks proxy: ${error}`);
            return;
        }

        this._clocksProxyID = this._clocksProxy.connect('g-properties-changed',
            this._onClocksPropertiesChanged.bind(this));
        this._onClocksPropertiesChanged();
    }
});

export const WeatherWidget = GObject.registerClass(
class ArcMenuWeatherWidget extends GWeatherWidget {
    _init(menuLayout) {
        super._init();
        this._menuLayout = menuLayout;

        this.connect('destroy', () => this._onDestroy());
    }

    _onDestroy() {
        this._weatherClient.disconnectAll();
        this._weatherClient = null;
        delete this._weatherClient;
    }

    vfunc_clicked() {
        this._menuLayout.arcMenu.toggle();
        this._weatherClient.activateApp();
    }
});
