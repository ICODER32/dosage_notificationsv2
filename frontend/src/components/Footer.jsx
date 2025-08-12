import React from "react";
import { Heart, Mail, Github, Twitter } from "lucide-react";
import { Link } from "react-router-dom";
import logo from "../assets/logo-white.png";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer-container custom-container">
      {/* <div className="footer-about">
        <div>
          <img src={logo} alt="" className="footer-logo" />
        </div>
        <p className="">
          Your daily medication companion. Track doses, stay on schedule, and
          never miss a pill.
        </p>
      </div> */}

      <p>© 2025 CareTrackRX All rights reserved.</p>

      {/* Links */}
      <div className="footer-links">
        {/* <h4 className="">Quick Links</h4> */}
        <ul className="">
          <li>
            <Link to="/dashboard" className="footer-link">
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/calendar" className="footer-link">
              Calendar
            </Link>
          </li>
          <li>
            <Link to="/add-caregiver" className="footer-link">
              CareGiver
            </Link>
          </li>
          {/* <li>
            <Link to="/settings" className="footer-link">
              Settings
            </Link>
          </li> */}
        </ul>
      </div>
    </footer>
  );
};

export default Footer;
