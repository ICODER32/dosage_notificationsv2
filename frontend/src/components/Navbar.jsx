// import React, { useState } from "react";
// import { Link, useNavigate } from "react-router-dom";
// import { useSelector, useDispatch } from "react-redux";
// import { logout } from "../store/auth/authslice"; // Adjust the import path
// import { Menu, X } from "lucide-react";

// const Navbar = () => {
//   const { isAuthenticated } = useSelector((state) => state.auth);
//   const dispatch = useDispatch();
//   const navigate = useNavigate();
//   const [menuOpen, setMenuOpen] = useState(false);

//   const handleLogout = () => {
//     dispatch(logout());
//     localStorage.removeItem("token");
//     navigate("/login");
//   };

//   return (
//     <nav className="bg-white shadow-md sticky top-0 z-50">
//       <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
//         {/* Logo */}
//         <Link to="/" className="text-2xl font-bold text-indigo-600">
//           MedTrack
//         </Link>

//         {/* Desktop Links */}
//         <div className="hidden md:flex items-center gap-6">
//           <Link to="/" className="text-gray-700 hover:text-indigo-600">
//             Dashboard
//           </Link>
//           <Link to="/calendar" className="text-gray-700 hover:text-indigo-600">
//             Calendar
//           </Link>
//           <Link to="/profile" className="text-gray-700 hover:text-indigo-600">
//             Profile
//           </Link>

//           {isAuthenticated ? (
//             <button
//               onClick={handleLogout}
//               className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-md text-sm"
//             >
//               Logout
//             </button>
//           ) : (
//             <Link
//               to="/login"
//               className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-md text-sm"
//             >
//               Login
//             </Link>
//           )}
//         </div>

//         {/* Mobile Menu Button */}
//         <button
//           className="md:hidden text-gray-700"
//           onClick={() => setMenuOpen(!menuOpen)}
//         >
//           {menuOpen ? <X size={24} /> : <Menu size={24} />}
//         </button>
//       </div>

//       {/* Mobile Menu */}
//       {menuOpen && (
//         <div className="md:hidden px-4 pb-4">
//           <Link
//             to="/dashboard"
//             className="block py-1 text-gray-700 hover:text-indigo-600"
//           >
//             Dashboard
//           </Link>
//           <Link
//             to="/calendar"
//             className="block py-1 text-gray-700 hover:text-indigo-600"
//           >
//             Calendar
//           </Link>
//           <Link
//             to="/profile"
//             className="block py-1 text-gray-700 hover:text-indigo-600"
//           >
//             Profile
//           </Link>
//           {isAuthenticated ? (
//             <button
//               onClick={handleLogout}
//               className="block mt-2 w-full text-left bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md text-sm"
//             >
//               Logout
//             </button>
//           ) : (
//             <Link
//               to="/login"
//               className="block mt-2 w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm"
//             >
//               Login
//             </Link>
//           )}
//         </div>
//       )}
//     </nav>
//   );
// };

// export default Navbar;

// --------------------------------------------------------------------
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------

import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../store/auth/authslice"; // Adjust the import path
import { Menu, X } from "lucide-react";
// import { IoSearch } from "react-icons/io5";
import { MdNotificationsNone, MdClose } from "react-icons/md";
import { IoMdLogOut } from "react-icons/io";
import { RxHamburgerMenu } from "react-icons/rx";

import logo from "../assets/logo.png";
// import avatar from "../assets/avatar.jpg";
import "./Navbar.css"; // Import the new CSS file

const Navbar = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
    localStorage.removeItem("token");
    setMenuOpen(false); // Close menu on logout
    navigate("/login");
  };

  const closeMenu = () => {
    // setMenuOpen(false);
    setMenuOpen((prevOpen) => !prevOpen);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container custom-container">
        {/* Logo */}
        <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          <div className="logo">
            <img src={logo} alt="" />
          </div>
        </Link>

        <div className="navbar-right-container">
          {/* Desktop Links */}
          <div className={`navbar-links ${menuOpen ? "open" : ""}`}>
            <button className="close-menu-btn" onClick={closeMenu}>
              <MdClose />
            </button>

            {/* <Link to="/profile" className="nav-link">
            Profile
          </Link> */}

            {/* {isAuthenticated ? (
              <button onClick={handleLogout} className="btn btn-logout">
                Logout
              </button>
            ) : (
              <Link to="/login" className="btn btn-login">
                Login
              </Link>
            )} */}

            {isAuthenticated && (
              <>
                <NavLink to="/" onClick={closeMenu} className="nav-link">
                  Dashboard
                </NavLink>
                <NavLink
                  to="/calendar"
                  onClick={closeMenu}
                  className="nav-link"
                >
                  Calendar
                </NavLink>
                <NavLink
                  to="/add-caregiver"
                  onClick={closeMenu}
                  className="nav-link"
                >
                  Caregiver
                </NavLink>
                <button onClick={handleLogout} className="logout-btn nav-link">
                  logout
                </button>
              </>
            )}
          </div>

          <div className="navbar-right-box">
            {/* <div className="icon-box">
              <IoSearch />
            </div> */}

            {isAuthenticated && (
              <>
                {/* <div className="icon-box">
                  <MdNotificationsNone />

                  <div className="noti-circle">3</div>
                </div> */}

                {/* <button onClick={handleLogout} className="logout-btn">
                  <IoMdLogOut />
                </button> */}

                <div className="icon-box mobile-menu" onClick={closeMenu}>
                  <RxHamburgerMenu />
                </div>
              </>
            )}

            {/* <div className="avatar">
              <img src={avatar} alt="" />
            </div> */}
          </div>
        </div>

        {/* Mobile Menu Button */}
        {/* <button
          className="navbar-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle mobile menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button> */}
      </div>

      {/* Mobile Menu */}
      {/* {menuOpen && (
        <div className="navbar-links-mobile">
          <Link to="/" className="nav-link-mobile" onClick={closeMenu}>
            Dashboard
          </Link>
          <Link to="/calendar" className="nav-link-mobile" onClick={closeMenu}>
            Calendar
          </Link>
          <Link to="/profile" className="nav-link-mobile" onClick={closeMenu}>
            Profile
          </Link>
          {isAuthenticated ? (
            <button onClick={handleLogout} className="btn btn-logout-mobile">
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              className="btn btn-login-mobile"
              onClick={closeMenu}
            >
              Login
            </Link>
          )}
        </div>
      )} */}
    </nav>
  );
};

export default Navbar;
