import React, { Component, Children } from "react";
import { findDOMNode } from "react-dom";
import PropTypes from "prop-types";
import raf from "raf";
import { TransitionMotion, spring } from "react-motion";

class FlipMotion extends Component {
  static propTypes = {
    children: PropTypes.oneOfType([
      PropTypes.node,
      PropTypes.arrayOf(PropTypes.node)
    ]),
    childClassName: PropTypes.string,
    childComponent: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    childStyle: PropTypes.object,
    className: PropTypes.string,
    component: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    scaleX: PropTypes.number,
    scaleY: PropTypes.number,
    springConfig: PropTypes.shape({
      stiffness: PropTypes.number,
      damping: PropTypes.number,
      precision: PropTypes.number
    }),
    style: PropTypes.object
  };

  static defaultProps = {
    childStyle: {},
    component: "div",
    childComponent: "div",
    scaleX: 0.6,
    scaleY: 0.6
  };

  state = {
    shouldMeasure: false,
    previousPosition: null,
    transform: null
  };

  children = {};

  getTransform = ({ scaleX, scaleY, x, y }) => {
    const transformString = `translate(${x}px, ${y}px) scaleX(${scaleX}) scaleY(${scaleY})`;
    return {
      transform: transformString,
      WebkitTransform: transformString
    };
  };

  getStyles() {
    const { shouldMeasure, unmountingElements } = this.state;
    const { scaleX, scaleY, springConfig } = this.props;

    // If some elements are unmounting, use previousChildren to be able to add out transition to leaving elements
    const children =
      unmountingElements && Object.keys(unmountingElements).length
        ? this.state.previousChildren
        : this.props.children;

    return Children.map(children, child => {
      return {
        data: child,
        style:
          unmountingElements && unmountingElements[child.key]
            ? {
                x: 0,
                y: 0,
                opacity: shouldMeasure ? 1 : spring(0, springConfig),
                scaleX: shouldMeasure ? 1 : spring(scaleX, springConfig),
                scaleY: shouldMeasure ? 1 : spring(scaleY, springConfig)
              }
            : {
                x: spring(0, springConfig),
                y: spring(0, springConfig),
                ...(this.state.transform && this.state.transform[child.key]
                  ? this.state.transform[child.key]
                  : null),
                opacity: spring(1, springConfig),
                scaleX: spring(1, springConfig),
                scaleY: spring(1, springConfig)
              },
        key: child.key
      };
    });
  }

  pruneUnmountingElements() {
    // Remove elements that have completed their out transition
    const prunedUnmountingElements = {};

    Object.keys(this.state.unmountingElements || {}).forEach(key => {
      const childEl = this.children[key];
      if (childEl && parseFloat(childEl.style.opacity) !== 0) {
        prunedUnmountingElements[key] = this.state.unmountingElements[key];
      }
    });

    if (!Object.keys(prunedUnmountingElements).length) {
      clearInterval(this.pruneLoop);
    }

    this.setState({ unmountingElements: prunedUnmountingElements });
  }

  componentDidUpdate(prevProps) {
    const prevChildren = Children.toArray(prevProps.children);
    const nextChildren = Children.toArray(this.props.children);
    if (
      nextChildren.some(
        (item, index) =>
          !prevChildren[index] || item.key !== prevChildren[index].key
      ) ||
      prevChildren.length !== nextChildren.length
    ) {
      const unmountingElements = {};
      const nextKeys = Children.map(this.props.children, child => child.key);
      const parentRect = findDOMNode(this).getBoundingClientRect();

      Children.forEach(prevProps.children, (prevChild, index) => {
        // If key is missing in nextKeys element is about to unmount. Store dimensions to be able to position absolutely
        if (nextKeys.indexOf(prevChild.key) === -1) {
          const child = this.children[prevChild.key];
          const rect = child.getBoundingClientRect();

          unmountingElements[prevChild.key] = {
            index,
            styles: {
              height: rect.height,
              width: rect.width,
              left: rect.left - parentRect.left,
              top: rect.top - parentRect.top,
              position: "absolute",
              zIndex: 0
            }
          };
        }
      });

      // Combine nextProps.children with unmounting elements to keep them mounted so they can be animated out
      const previousChildren = [].concat(
        this.props.children,
        Object.values(unmountingElements).map(
          element => prevProps.children[element.index]
        )
      );

      // As TransitionMotion does not provide a callback for motion end, we need to manually remove the elements that have completed their out transition and are ready to be unmounted
      clearInterval(this.pruneLoop);
      this.pruneLoop = setInterval(
        this.pruneUnmountingElements.bind(this),
        100
      );

      this.setState(
        {
          unmountingElements,
          shouldMeasure: true,
          previousChildren,
          previousPosition: Object.entries(this.children).reduce(
            (acc, [key, child]) =>
              Object.assign(
                acc,
                child ? { [key]: child.getBoundingClientRect() } : {}
              ),
            {}
          ),
          transform: null
        },
        () => {
          raf(() => {
            this.setState(
              state => ({
                shouldMeasure: false,
                transform: Object.entries(this.children).reduce(
                  (acc, [key, child]) => {
                    const previousRect = state.previousPosition[key];
                    const childRect = child && child.getBoundingClientRect();
                    return Object.assign({}, acc, {
                      [key]:
                        childRect && previousRect
                          ? {
                              x: previousRect.left - childRect.left,
                              y: previousRect.top - childRect.top
                            }
                          : { x: 0, y: 0 }
                    });
                  },
                  {}
                ),
                previousPosition: null
              }),
              () => {
                if (this.state.transform) {
                  this.setState(state => ({
                    transform: Object.keys(state.transform).reduce(
                      (acc, key) =>
                        Object.assign({}, acc, {
                          [key]: {
                            x: spring(0, this.props.springConfig),
                            y: spring(0, this.props.springConfig)
                          }
                        }),
                      {}
                    )
                  }));
                  this.children = {};
                }
              }
            );
          });
        }
      );
    }
  }

  willEnter = () => {
    return {
      x: 0,
      y: 0,
      scaleX: this.props.scaleX,
      scaleY: this.props.scaleY,
      opacity: 0
    };
  };

  render() {
    const style = this.props.style;
    const childStyle = this.props.childStyle;
    const Component = this.props.component;
    const ChildComponent = this.props.childComponent;
    const unmountingElements = this.state.unmountingElements || {};
    const hasUnmountingElements = Object.keys(unmountingElements).length;

    return (
      <TransitionMotion styles={this.getStyles()} willEnter={this.willEnter}>
        {styles => (
          <Component
            style={{ ...style, position: "relative" }}
            className={this.props.className}
          >
            {styles.map(item => {
              const willUnmount =
                this.state.shouldMeasure && unmountingElements[item.key];
              const unMountingStyles =
                unmountingElements[item.key] &&
                unmountingElements[item.key].styles;

              return (
                <ChildComponent
                  className={this.props.childClassName}
                  key={item.key}
                  style={
                    item.style && {
                      ...childStyle,
                      ...(hasUnmountingElements
                        ? {
                            position: "relative",
                            zIndex: 1
                          }
                        : {}),
                      ...unMountingStyles,
                      ...this.getTransform(item.style),
                      display: willUnmount ? "none" : childStyle.display,
                      opacity: item.style.opacity
                    }
                  }
                  ref={c => (this.children[item.key] = c)}
                >
                  {item.data}
                </ChildComponent>
              );
            })}
          </Component>
        )}
      </TransitionMotion>
    );
  }
}

export default FlipMotion;
